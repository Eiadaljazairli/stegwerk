import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { MAX_MASSEN, MassenResolver } from './massen.resolver';

const SUITE = 'massen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let massen: MassenResolver;
let kontakte: ContactsService;
let permissions: PermissionsService;
let workspaceId: string;
let inhaberin: RequestUser;
let aushilfe: RequestUser;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test', userId: wer.userId }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  massen = new MassenResolver(
    dataSource,
    permissions,
    new CompaniesService(dataSource.getRepository(CompanyEntity), felder),
    kontakte,
    new DealsService(dataSource.getRepository(DealEntity), felder),
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Viele', slug: 'viele' }))
  ).id;

  const anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@viele.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Viele',
    }),
  );
  const ben = await m.save(
    m.create(UserEntity, {
      email: 'ben@viele.test',
      passwordHash: 'x',
      firstName: 'Ben',
      lastName: 'Viele',
    }),
  );
  const rolle = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Vertrieb eigene',
      permissions: [
        Permission.COMPANY_VIEW,
        Permission.COMPANY_WRITE,
        Permission.DEAL_VIEW,
        Permission.DEAL_WRITE,
      ],
      sichtbarkeit: { company: 'eigene', contact: 'alle', deal: 'alle' },
      feldrechte: { 'company.annualRevenue': 'lesen' },
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      userId: ben.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle.id,
    }),
  ]);

  inhaberin = { userId: anna.id, workspaceId, email: anna.email };
  aushilfe = { userId: ben.id, workspaceId, email: ben.email };
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Massen über die Schnittstelle', () => {
  it('legt an, und eine ungültige Zeile hält die anderen nicht auf', async () => {
    const ergebnis = await als(inhaberin, () =>
      massen.createContacts(inhaberin, [
        { firstName: 'Eva', lastName: 'Eins', email: 'eva@kunde.de' },
        { firstName: 'Falsch', lastName: 'Zwei', email: 'keine-adresse' },
        { firstName: 'Gerd', lastName: 'Drei' },
      ] as never),
    );

    expect(ergebnis).toMatchObject({ created: 2, updated: 0, rejected: 1 });
    expect(ergebnis.rows[1]).toMatchObject({ index: 1, id: null });
    expect(ergebnis.rows[1].error).toMatch(/E-Mail|email/iu);
    expect(
      await dataSource.manager.count(ContactEntity, { where: { workspaceId } }),
    ).toBe(2);
  });

  it('nimmt eine Zeile, die beim Speichern scheitert, ganz zurück', async () => {
    const ergebnis = await als(inhaberin, () =>
      massen.createDeals(inhaberin, [
        { name: 'Gut' },
        { name: 'Schlecht', companyId: '00000000-0000-4000-8000-000000000000' },
        { name: 'Auch gut' },
      ] as never),
    );

    expect(ergebnis).toMatchObject({ created: 2, rejected: 1 });
    expect(
      (
        await dataSource.manager.find(DealEntity, { where: { workspaceId } })
      ).map((deal) => deal.name),
    ).toEqual(expect.arrayContaining(['Gut', 'Auch gut']));
    expect(
      await dataSource.manager.count(DealEntity, {
        where: { workspaceId, name: 'Schlecht' },
      }),
    ).toBe(0);
  });

  it('gleicht Firmen über die Domain ab, auch innerhalb desselben Aufrufs', async () => {
    const erst = await als(inhaberin, () =>
      massen.upsertCompanies(inhaberin, [
        { name: 'Acme', domain: 'https://www.acme.de/' },
      ] as never),
    );
    const dann = await als(inhaberin, () =>
      massen.upsertCompanies(inhaberin, [
        { name: 'Acme GmbH', domain: 'ACME.de', city: 'Köln' },
        { name: 'Neu AG', domain: 'neu.de' },
        { name: 'Neu AG Köln', domain: 'neu.de' },
      ] as never),
    );

    expect(erst.created).toBe(1);
    expect(dann).toMatchObject({ created: 1, updated: 2, rejected: 0 });
    expect(dann.rows[0].id).toBe(erst.rows[0].id);

    const acme = await dataSource.manager.findOneByOrFail(CompanyEntity, {
      id: erst.rows[0].id as string,
    });

    expect(acme).toMatchObject({ name: 'Acme GmbH', city: 'Köln' });
    expect(
      await dataSource.manager.count(CompanyEntity, {
        where: { workspaceId, domain: 'neu.de' },
      }),
    ).toBe(1);
  });

  it('ändert nur, was die Rolle sehen und ändern darf', async () => {
    const fremd = await dataSource.manager.save(
      dataSource.manager.create(CompanyEntity, {
        workspaceId,
        name: 'Fremd',
        domain: 'fremd.de',
        ownerId: inhaberin.userId,
      }),
    );
    const eigen = await dataSource.manager.save(
      dataSource.manager.create(CompanyEntity, {
        workspaceId,
        name: 'Eigen',
        ownerId: aushilfe.userId,
      }),
    );

    const ergebnis = await als(aushilfe, () =>
      massen.updateCompanies(aushilfe, [
        { id: fremd.id, name: 'Übernommen' },
        { id: eigen.id, name: 'Eigen neu' },
        { id: eigen.id, annualRevenue: 1000 },
      ] as never),
    );
    const abgleich = await als(aushilfe, () =>
      massen.upsertCompanies(aushilfe, [
        { name: 'Doppelt', domain: 'fremd.de' },
      ] as never),
    );

    expect(ergebnis).toMatchObject({ updated: 1, rejected: 2 });
    expect(ergebnis.rows[2].error).toMatch(/nicht ändern/u);
    expect(abgleich).toMatchObject({ created: 0, rejected: 1 });
    expect(
      (
        await dataSource.manager.findOneByOrFail(CompanyEntity, {
          id: fremd.id,
        })
      ).name,
    ).toBe('Fremd');
  });

  it('nimmt höchstens hundert Zeilen und verlangt das Schreibrecht', async () => {
    await expect(
      als(inhaberin, () =>
        massen.createCompanies(
          inhaberin,
          Array.from({ length: MAX_MASSEN + 1 }, (_, i) => ({
            name: `F${String(i)}`,
          })) as never,
        ),
      ),
    ).rejects.toThrow(/zwischen 1 und 100/u);
    await expect(
      als(aushilfe, () =>
        massen.createContacts(aushilfe, [
          { firstName: 'X', lastName: 'Y' },
        ] as never),
      ),
    ).rejects.toThrow(/Berechtigung/u);
  });
});

describe('Meldungen erst nach dem Speichern', () => {
  it('meldet nach dem COMMIT, und eine zurückgerollte Zeile gar nicht', async () => {
    const gemeldet: string[] = [];
    const gesehen: Promise<boolean>[] = [];
    const abmelden = hoereAuf((meldung: Meldung) => {
      if (meldung.event !== 'contact.created') {
        return;
      }

      gemeldet.push(String(meldung.data.lastName));
      gesehen.push(
        dataSource
          .query('SELECT 1 FROM "contacts" WHERE "id" = $1', [meldung.data.id])
          .then((zeilen: unknown[]) => zeilen.length === 1),
      );
    });
    const anlegen = kontakte.create.bind(kontakte);
    const spion = jest
      .spyOn(kontakte, 'create')
      .mockImplementation(async (bereich, eingabe) => {
        const angelegt = await anlegen(bereich, eingabe);

        if (eingabe.lastName === 'Zurück') {
          throw new Error('Nach dem Speichern gescheitert.');
        }

        return angelegt;
      });

    try {
      const ergebnis = await als(inhaberin, () =>
        massen.createContacts(inhaberin, [
          { firstName: 'Hans', lastName: 'Eins' },
          { firstName: 'Ida', lastName: 'Zurück' },
          { firstName: 'Jan', lastName: 'Drei' },
        ] as never),
      );

      expect(ergebnis).toMatchObject({ created: 2, rejected: 1 });
      expect(gemeldet).toEqual(['Eins', 'Drei']);
      expect(await Promise.all(gesehen)).toEqual([true, true]);
    } finally {
      spion.mockRestore();
      abmelden();
    }
  });

  it('hängt nicht, wenn eine Regel die geänderten Geschäfte selbst ändert', async () => {
    const geschaefte = await dataSource.manager.save(
      Array.from({ length: 6 }, (_, i) =>
        dataSource.manager.create(DealEntity, {
          workspaceId,
          name: `Regel ${String(i)}`,
        }),
      ),
    );
    const regeln: Promise<unknown>[] = [];
    const abmelden = hoereAuf((meldung: Meldung) => {
      if (meldung.event === 'deal.updated') {
        regeln.push(
          dataSource.query(
            'UPDATE "deals" SET "probability" = 50 WHERE "id" = $1',
            [meldung.data.id],
          ),
        );
      }
    });

    try {
      const ergebnis = await als(inhaberin, () =>
        massen.updateDeals(
          inhaberin,
          geschaefte.map((deal) => ({ id: deal.id, amount: 1000 })) as never,
        ),
      );

      await Promise.all(regeln);

      expect(ergebnis).toMatchObject({ updated: 6, rejected: 0 });
      expect(
        await dataSource.manager.countBy(DealEntity, {
          workspaceId,
          probability: 50,
        }),
      ).toBe(6);
    } finally {
      abmelden();
    }
  }, 20_000);
});
