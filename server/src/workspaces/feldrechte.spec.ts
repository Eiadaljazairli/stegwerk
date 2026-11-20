import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AuswertungResolver } from '../crm/auswertung.resolver';
import { type AuswertungService } from '../crm/auswertung.service';
import { CompaniesService } from '../crm/companies.service';
import { ContactsService } from '../crm/contacts.service';
import { DealsService } from '../crm/deals.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ExportService } from '../export/export.service';
import { ImportEntity } from '../import/dto/import.dto';
import { ImportService } from '../import/import.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { verbirgEigeneFelder, verbirgFeld } from './feld-middleware';
import { assertFeldrechteVergebbar } from './feldrechte';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { setzeSichtfeld } from './sichtbarkeit';
import { WorkspaceEntity } from './workspace.entity';

const SUITE = 'd1_feldrechte';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let geschaefte: DealsService;
let exporte: ExportService;
let importe: ImportService;
let workspaceId: string;
let inhaberin: RequestUser;
let aushilfe: RequestUser;
let leser: RequestUser;
let geschaeftId: string;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const ausgeliefert = (
  middleware: ReturnType<typeof verbirgFeld>,
  wert: unknown,
): Promise<unknown> =>
  Promise.resolve(
    middleware({} as never, () => Promise.resolve(wert)),
  ) as Promise<unknown>;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
  exporte = new ExportService(
    new CompaniesService(dataSource.getRepository(CompanyEntity), felder),
    new ContactsService(dataSource.getRepository(ContactEntity), felder),
    geschaefte,
    felder,
  );
  importe = new ImportService(dataSource, felder);

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Vertrieb', slug: 'd1-fr' }))
  ).id;

  await felder.create(workspaceId, {
    entity: CustomFieldEntity.DEAL,
    label: 'Budget',
    type: CustomFieldType.NUMBER,
  });

  const users = dataSource.getRepository(UserEntity);
  const person = (email: string) =>
    users.save(
      users.create({ email, passwordHash: 'x', firstName: 'X', lastName: 'Y' }),
    );
  const [anna, aron, lea] = await Promise.all([
    person('anna@d1.test'),
    person('aron@d1.test'),
    person('lea@d1.test'),
  ]);

  const roles = dataSource.getRepository(RoleEntity);
  const rechte = [
    Permission.COMPANY_VIEW,
    Permission.CONTACT_VIEW,
    Permission.DEAL_VIEW,
    Permission.DEAL_WRITE,
  ];
  const [owner, ohneBetrag, nurLesen] = await roles.save([
    roles.create({
      workspaceId,
      name: 'Inhaber',
      templateKey: 'owner',
      everything: true,
      permissions: [],
      isSystem: true,
    }),
    roles.create({
      workspaceId,
      name: 'Aushilfe',
      everything: false,
      permissions: rechte,
      feldrechte: {
        'deal.amount': 'verborgen',
        'custom:deal:budget': 'verborgen',
      },
      isSystem: false,
    }),
    roles.create({
      workspaceId,
      name: 'Nur lesen',
      everything: false,
      permissions: rechte,
      feldrechte: { 'deal.amount': 'lesen', 'custom:deal:budget': 'lesen' },
      isSystem: false,
    }),
  ]);

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save([
    {
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
    },
    {
      userId: aron.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: ohneBetrag.id,
    },
    {
      userId: lea.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: nurLesen.id,
    },
  ]);

  inhaberin = { userId: anna.id, workspaceId, email: anna.email };
  aushilfe = { userId: aron.id, workspaceId, email: aron.email };
  leser = { userId: lea.id, workspaceId, email: lea.email };

  geschaeftId = (
    await geschaefte.create(workspaceId, {
      name: 'Großauftrag',
      amount: 50_000,
      customFields: { budget: 60_000 },
    })
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('verborgene Felder', () => {
  it('liefert Betrag und eigenes Feld nicht aus, dem Inhaber schon', async () => {
    const betrag = verbirgFeld('deal.amount');
    const eigene = verbirgEigeneFelder('deal');

    expect(await als(aushilfe, () => ausgeliefert(betrag, 50_000))).toBeNull();
    expect(
      await als(aushilfe, () =>
        ausgeliefert(eigene, { budget: 60_000, quelle: 'Messe' }),
      ),
    ).toEqual({ quelle: 'Messe' });

    expect(await als(inhaberin, () => ausgeliefert(betrag, 50_000))).toBe(
      50_000,
    );
    expect(await als(leser, () => ausgeliefert(betrag, 50_000))).toBe(50_000);
    expect(await ausgeliefert(betrag, 50_000)).toBe(50_000);
  });

  it('lässt den Betrag im Export weg', async () => {
    const csv = await als(aushilfe, () => exporte.csv(workspaceId, 'DEAL'));
    const kopf = csv.split('\n')[0];

    expect(kopf).not.toContain('Betrag');
    expect(kopf).not.toContain('Budget');
    expect(csv).not.toContain('50000');

    const voll = await als(inhaberin, () => exporte.csv(workspaceId, 'DEAL'));

    expect(voll.split('\n')[0]).toContain('Betrag');
  });

  it('exportiert auf Wunsch nur die Auswahl', async () => {
    await als(inhaberin, () =>
      geschaefte.create(workspaceId, { name: 'Nicht gewählt' }),
    );

    const auswahl = await als(inhaberin, () =>
      exporte.csv(workspaceId, 'DEAL', {}, { ids: [geschaeftId] }),
    );

    expect(auswahl.trim().split('\n')).toHaveLength(2);
    expect(auswahl).not.toContain('Nicht gewählt');
  });

  it('lehnt Filter und Sortierung darauf ab, Summen bleiben leer', async () => {
    await expect(
      als(aushilfe, () =>
        geschaefte.list(workspaceId, {
          customFilters: [
            {
              key: 'std:amount',
              operator: CustomFieldFilterOperator.GREATER_THAN,
              value: '10000',
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      als(aushilfe, () =>
        geschaefte.list(workspaceId, { sortField: 'custom:budget' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      als(aushilfe, () =>
        geschaefte.list(workspaceId, {}, { minAmount: 10000 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      als(aushilfe, () =>
        geschaefte.summen(workspaceId, {}, { minAmount: 1 }, 'amount'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await als(aushilfe, () =>
        geschaefte.summen(workspaceId, {}, {}, 'amount', 'currency'),
      ),
    ).toEqual([]);

    const liste = await als(aushilfe, () => geschaefte.list(workspaceId, {}));

    expect(liste.items.map((g) => g.name)).toContain('Großauftrag');
  });
  it('zählt Beträge in der Auswertung nicht zusammen', async () => {
    const roh = {
      gewonnenSumme: 50_000,
      verlorenSumme: 10_000,
      durchschnittWert: 50_000,
      monate: [{ monat: '2026-10', gewonnenSumme: 50_000, verlorenSumme: 0 }],
      verkaeufer: [{ offenSumme: 5, gewonnenSumme: 50_000 }],
      verlustgruende: [{ summe: 10_000 }],
    };
    const resolver = new AuswertungResolver(permissions, {
      berechne: () => Promise.resolve(roh),
    } as unknown as AuswertungService);
    const frage = (wer: RequestUser) =>
      als(wer, () => resolver.auswertung(wer, '2026-01-01', '2026-12-31'));

    const verborgen = await frage(aushilfe);

    expect(verborgen.betraegeVerborgen).toBe(true);
    expect(JSON.stringify(verborgen)).not.toMatch(/50000|10000/);
    expect(verborgen.durchschnittWert).toBeNull();

    const voll = await frage(inhaberin);

    expect(voll.betraegeVerborgen).toBe(false);
    expect(voll.gewonnenSumme).toBe(50_000);
  });
});

describe('nur lesbare Felder', () => {
  it('lehnt eine Änderung ab, andere Felder bleiben änderbar', async () => {
    await expect(
      als(leser, () =>
        geschaefte.update(workspaceId, geschaeftId, { amount: 1 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(leser, () =>
        geschaefte.update(workspaceId, geschaeftId, {
          customFields: { budget: 1 },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const umbenannt = await als(leser, () =>
      geschaefte.update(workspaceId, geschaeftId, { name: 'Großauftrag Nord' }),
    );

    expect(umbenannt.name).toBe('Großauftrag Nord');
    expect(Number(umbenannt.amount)).toBe(50_000);
  });

  it('lehnt einen Import mit dem Feld ab', async () => {
    await expect(
      als(leser, () =>
        importe.run(workspaceId, {
          entity: ImportEntity.DEAL,
          csv: 'Name;Betrag\nImport;5\n',
          mapping: [
            { column: 'Name', field: 'name' },
            { column: 'Betrag', field: 'amount' },
          ],
          dryRun: true,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lässt beim Anlegen ein leeres Feld zu', async () => {
    const neu = await als(leser, () =>
      geschaefte.create(workspaceId, { name: 'Ohne Betrag' }),
    );

    expect(neu.name).toBe('Ohne Betrag');
  });
});

describe('Vergeben', () => {
  it('gibt keiner Rolle mehr, als man selbst hat', () => {
    expect(() =>
      assertFeldrechteVergebbar({ 'deal.amount': 'lesen' }, {}),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertFeldrechteVergebbar(
        { 'deal.amount': 'verborgen' },
        { 'deal.amount': 'lesen' },
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertFeldrechteVergebbar(
        { 'deal.amount': 'lesen' },
        { 'deal.amount': 'lesen' },
      ),
    ).not.toThrow();
    expect(() => assertFeldrechteVergebbar({}, {})).not.toThrow();
  });
});
