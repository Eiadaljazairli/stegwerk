import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { type Feldrechte } from '../workspaces/feldrechte';
import { setzeSichtfeld, type Sichtbarkeit } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { FilterVerknuepfung, SortDirection } from './dto/pagination.dto';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity, DealStage } from './entities/deal.entity';

const SUITE = 'listen_gruppen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let companies: CompaniesService;
let contacts: ContactsService;
let deals: DealsService;
let customFields: CustomFieldsService;
let workspaceId: string;
let otherWorkspaceId: string;
let annaId: string;
let jonasId: string;

const als = <T>(
  ich: string,
  arten: Partial<Sichtbarkeit>,
  felder: Feldrechte,
  callback: () => Promise<T>,
): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich,
        arten: { company: 'alle', contact: 'alle', deal: 'alle', ...arten },
        felder,
      }),
    );

    return callback();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  customFields = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  companies = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    customFields,
  );
  contacts = new ContactsService(
    dataSource.getRepository(ContactEntity),
    customFields,
  );
  deals = new DealsService(dataSource.getRepository(DealEntity), customFields);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE deals, contacts, companies, custom_fields, memberships, users, workspaces CASCADE',
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const memberships = dataSource.getRepository(MembershipEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  const person = async (vorname: string) =>
    (
      await users.save(
        users.create({
          email: `${vorname.toLowerCase()}@wir.de`,
          passwordHash: 'x',
          firstName: vorname,
          lastName: 'Muster',
        }),
      )
    ).id;

  annaId = await person('Anna');
  jonasId = await person('Jonas');

  await memberships.save([
    memberships.create({
      workspaceId,
      userId: annaId,
      role: MembershipRole.OWNER,
    }),
    memberships.create({
      workspaceId,
      userId: jonasId,
      role: MembershipRole.MEMBER,
    }),
  ]);
});

const namen = (page: { items: { name?: string; lastName?: string }[] }) =>
  page.items.map((item) => item.name ?? item.lastName).sort();

describe('UND und ODER', () => {
  beforeEach(async () => {
    await companies.create(workspaceId, {
      name: 'A',
      city: 'Hamburg',
      industry: 'Bau',
    });
    await companies.create(workspaceId, {
      name: 'B',
      city: 'Bremen',
      industry: 'Bau',
    });
    await companies.create(workspaceId, {
      name: 'C',
      city: 'Bremen',
      industry: 'Handel',
    });
    await companies.create(workspaceId, {
      name: 'D',
      city: 'Kiel',
      industry: 'Handel',
    });
    await companies.create(otherWorkspaceId, {
      name: 'Fremd',
      city: 'Hamburg',
      industry: 'Bau',
    });
  });

  it('verbindet oben mit ODER, ohne den Arbeitsbereich zu verlassen', async () => {
    const page = await companies.list(workspaceId, {
      filterVerknuepfung: FilterVerknuepfung.ODER,
      customFilters: [
        { key: 'std:city', operator: Op.EQUALS, value: 'Hamburg' },
        { key: 'std:industry', operator: Op.EQUALS, value: 'Handel' },
      ],
    });

    expect(namen(page)).toEqual(['A', 'C', 'D']);
  });

  it('liest eine Gruppe unter UND als ODER: Bau und (Hamburg oder Bremen)', async () => {
    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:industry', operator: Op.EQUALS, value: 'Bau' },
        { key: 'std:city', operator: Op.EQUALS, value: 'Hamburg', gruppe: 1 },
        { key: 'std:city', operator: Op.EQUALS, value: 'Kiel', gruppe: 1 },
      ],
    });

    expect(namen(page)).toEqual(['A']);
  });

  it('liest eine Gruppe unter ODER als UND: Kiel oder (Bremen und Handel)', async () => {
    const page = await companies.list(workspaceId, {
      filterVerknuepfung: FilterVerknuepfung.ODER,
      customFilters: [
        { key: 'std:city', operator: Op.EQUALS, value: 'Kiel' },
        { key: 'std:city', operator: Op.EQUALS, value: 'Bremen', gruppe: 2 },
        {
          key: 'std:industry',
          operator: Op.EQUALS,
          value: 'Handel',
          gruppe: 2,
        },
      ],
    });

    expect(namen(page)).toEqual(['C', 'D']);
  });

  it('zählt Summe und Anzahl über dieselbe Bedingung', async () => {
    await dataSource.query(
      `UPDATE companies SET "annualRevenue" = 100 WHERE "workspaceId" = $1`,
      [workspaceId],
    );

    const args = {
      filterVerknuepfung: FilterVerknuepfung.ODER,
      customFilters: [
        { key: 'std:city', operator: Op.EQUALS, value: 'Hamburg' },
        { key: 'std:city', operator: Op.EQUALS, value: 'Kiel' },
      ],
    };

    expect((await companies.list(workspaceId, args)).totalCount).toBe(2);
    expect(
      await companies.summen(workspaceId, args, {}, 'annualRevenue'),
    ).toEqual([{ gruppe: null, summe: 200 }]);
  });
});

describe('Filter über die Firma', () => {
  it('findet Kontakte nach Stadt und Branche ihrer Firma', async () => {
    const hamburg = await companies.create(workspaceId, {
      name: 'H',
      city: 'Hamburg',
      industry: 'Bau',
    });
    const kiel = await companies.create(workspaceId, {
      name: 'K',
      city: 'Kiel',
      industry: 'Bau',
    });

    await contacts.create(workspaceId, {
      firstName: 'a',
      lastName: 'Hamburger',
      companyId: hamburg.id,
    });
    await contacts.create(workspaceId, {
      firstName: 'b',
      lastName: 'Kieler',
      companyId: kiel.id,
    });
    await contacts.create(workspaceId, { firstName: 'c', lastName: 'Ohne' });

    const inHamburg = await contacts.list(workspaceId, {
      customFilters: [
        { key: 'std:firma.city', operator: Op.EQUALS, value: 'hamburg' },
      ],
    });

    expect(namen(inHamburg)).toEqual(['Hamburger']);

    const ohneStadt = await contacts.list(workspaceId, {
      customFilters: [{ key: 'std:firma.city', operator: Op.IS_EMPTY }],
    });

    expect(namen(ohneStadt)).toEqual(['Ohne']);
  });

  it('behandelt eine Firma im Papierkorb wie keine', async () => {
    const firma = await companies.create(workspaceId, {
      name: 'Weg',
      city: 'Hamburg',
    });

    await contacts.create(workspaceId, {
      firstName: 'a',
      lastName: 'Rest',
      companyId: firma.id,
    });
    await dataSource.query(
      `UPDATE companies SET "deletedAt" = now() WHERE id = $1`,
      [firma.id],
    );

    const page = await contacts.list(workspaceId, {
      customFilters: [
        { key: 'std:firma.city', operator: Op.EQUALS, value: 'Hamburg' },
      ],
    });

    expect(page.totalCount).toBe(0);
  });

  it('verrät nichts über eine Firma, die die Rolle nicht sieht', async () => {
    const fremde = await companies.create(workspaceId, {
      name: 'Annas',
      city: 'Hamburg',
      ownerId: annaId,
    });
    const eigene = await companies.create(workspaceId, {
      name: 'Jonas',
      city: 'Hamburg',
      ownerId: jonasId,
    });

    await contacts.create(workspaceId, {
      firstName: 'a',
      lastName: 'AnFremder',
      companyId: fremde.id,
    });
    await contacts.create(workspaceId, {
      firstName: 'b',
      lastName: 'AnEigener',
      companyId: eigene.id,
    });

    const page = await als(jonasId, { company: 'eigene' }, {}, () =>
      contacts.list(workspaceId, {
        customFilters: [
          { key: 'std:firma.city', operator: Op.EQUALS, value: 'Hamburg' },
        ],
      }),
    );

    expect(namen(page)).toEqual(['AnEigener']);
  });

  it('lehnt einen Filter auf ein verborgenes Feld der Firma ab', async () => {
    await expect(
      als(jonasId, {}, { 'company.annualRevenue': 'verborgen' }, () =>
        deals.list(workspaceId, {
          customFilters: [
            {
              key: 'std:firma.annualRevenue',
              operator: Op.GREATER_THAN,
              value: '1000',
            },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Teile der Anschrift', () => {
  const verborgen: Feldrechte = { 'contact.street': 'verborgen' };

  it('lehnt Filter nach PLZ, Stadt und Land ab, auch im Export', async () => {
    await contacts.create(workspaceId, {
      firstName: 'Eva',
      lastName: 'Privat',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'Deutschland',
    });

    for (const [key, operator, value] of [
      ['std:postalCode', Op.EQUALS, '20095'],
      ['std:city', Op.STARTS_WITH, 'Ham'],
      ['std:country', Op.EQUALS, 'Deutschland'],
    ] as const) {
      const args = { customFilters: [{ key, operator, value }] };

      await expect(
        als(jonasId, {}, verborgen, () => contacts.list(workspaceId, args)),
      ).rejects.toThrow(/Anschrift/u);
      await expect(
        als(jonasId, {}, verborgen, () => contacts.listAll(workspaceId, args)),
      ).rejects.toThrow(/Anschrift/u);
    }
  });

  it('lehnt Gruppierung und Sortierung nach der Stadt ab', async () => {
    await expect(
      als(jonasId, {}, verborgen, () =>
        contacts.gruppen(workspaceId, { gruppierung: 'std:city' }, {}),
      ),
    ).rejects.toThrow(/Anschrift/u);
    await expect(
      als(jonasId, {}, verborgen, () =>
        contacts.list(workspaceId, {
          gruppe: { feld: 'std:city', wert: 'Hamburg' },
        }),
      ),
    ).rejects.toThrow(/Anschrift/u);
    await expect(
      als(jonasId, {}, verborgen, () =>
        contacts.list(workspaceId, { sortField: 'city' }),
      ),
    ).rejects.toThrow(/Anschrift/u);
  });
});

describe('Export', () => {
  it('liefert nach einem eigenen Feld sortiert alle Zeilen, über mehrere Blöcke', async () => {
    const budget = await customFields.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Budget',
      type: CustomFieldType.NUMBER,
    });

    const firma = await companies.create(workspaceId, { name: 'Kunde' });

    await dataSource.query(
      `INSERT INTO "deals" ("workspaceId", "name", "companyId", "customFields")
       SELECT $1, 'G' || i, $2, jsonb_build_object($3::text, i)
         FROM generate_series(1, 501) AS i`,
      [workspaceId, firma.id, budget.key],
    );

    const zeilen = await deals.listAll(workspaceId, {
      sortField: `custom:${budget.key}`,
      sortDirection: SortDirection.DESC,
    });

    expect(zeilen).toHaveLength(501);
    expect(zeilen[0]).toMatchObject({ name: 'G501' });
    expect(zeilen[500]).toMatchObject({ name: 'G1' });
    expect(zeilen[0].company?.name).toBe('Kunde');
  });
});

describe('Gruppen', () => {
  it('zählt Geschäfte je Phase und summiert je Währung', async () => {
    await deals.create(workspaceId, {
      name: '1',
      stage: DealStage.LEAD,
      amount: 100,
      currency: 'EUR',
    });
    await deals.create(workspaceId, {
      name: '2',
      stage: DealStage.LEAD,
      amount: 50,
      currency: 'USD',
    });
    await deals.create(workspaceId, {
      name: '3',
      stage: DealStage.WON,
      amount: 70,
      currency: 'EUR',
    });
    await deals.create(otherWorkspaceId, {
      name: 'x',
      stage: DealStage.LEAD,
      amount: 999,
      currency: 'EUR',
    });

    const gruppen = await deals.gruppen(
      workspaceId,
      { gruppierung: 'std:stage' },
      {},
    );
    const lead = gruppen.find((gruppe) => gruppe.wert === DealStage.LEAD);

    expect(lead).toMatchObject({
      anzahl: 2,
      summen: [
        { gruppe: 'EUR', summe: 100 },
        { gruppe: 'USD', summe: 50 },
      ],
    });
    expect(
      gruppen.find((gruppe) => gruppe.wert === DealStage.WON)?.anzahl,
    ).toBe(1);
  });

  it('lädt die Zeilen einer Gruppe, auch der ohne Wert', async () => {
    await companies.create(workspaceId, { name: 'A', industry: 'Bau' });
    await companies.create(workspaceId, { name: 'B', industry: '' });
    await companies.create(workspaceId, { name: 'C' });

    const gruppen = await companies.gruppen(
      workspaceId,
      { gruppierung: 'std:industry' },
      {},
    );

    expect(gruppen.map((g) => [g.wert, g.anzahl])).toEqual([
      [null, 2],
      ['Bau', 1],
    ]);

    const ohne = await companies.list(workspaceId, {
      gruppe: { feld: 'std:industry', wert: null },
    });

    expect(namen(ohne)).toEqual(['B', 'C']);
  });

  it('nennt Personen und verbirgt den Namen einer nicht sichtbaren Firma', async () => {
    const fremde = await companies.create(workspaceId, {
      name: 'Geheim',
      ownerId: annaId,
    });

    await contacts.create(workspaceId, {
      firstName: 'a',
      lastName: 'X',
      companyId: fremde.id,
      ownerId: jonasId,
    });

    const nachPerson = await contacts.gruppen(
      workspaceId,
      { gruppierung: 'std:ownerId' },
      {},
    );

    expect(nachPerson[0]).toMatchObject({
      wert: jonasId,
      label: 'Jonas Muster',
    });

    const nachFirma = await als(jonasId, { company: 'eigene' }, {}, () =>
      contacts.gruppen(workspaceId, { gruppierung: 'std:companyId' }, {}),
    );

    expect(nachFirma[0]).toMatchObject({
      wert: fremde.id,
      label: null,
      nichtSichtbar: true,
      anzahl: 1,
    });
  });

  it('gruppiert nach einem eigenen Auswahlfeld, nicht nach freiem Text', async () => {
    await customFields.create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Region',
      type: CustomFieldType.SELECT,
      options: ['Nord', 'Süd'],
    });
    await customFields.create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Notiz',
      type: CustomFieldType.TEXT,
    });
    await companies.create(workspaceId, {
      name: 'A',
      customFields: { region: 'Nord' },
    });
    await companies.create(workspaceId, {
      name: 'B',
      customFields: { region: 'Nord' },
    });

    const gruppen = await companies.gruppen(
      workspaceId,
      { gruppierung: 'custom:region' },
      {},
    );

    expect(gruppen).toEqual([
      expect.objectContaining({ wert: 'Nord', anzahl: 2 }),
    ]);

    const nord = await companies.list(workspaceId, {
      gruppe: { feld: 'custom:region', wert: 'Nord' },
    });

    expect(nord.totalCount).toBe(2);

    await expect(
      companies.gruppen(workspaceId, { gruppierung: 'custom:notiz' }, {}),
    ).rejects.toThrow(BadRequestException);
    await expect(
      companies.gruppen(
        workspaceId,
        { gruppierung: 'std:name"; DROP TABLE x; --' },
        {},
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('summiert keinen verborgenen Betrag', async () => {
    await deals.create(workspaceId, {
      name: '1',
      stage: DealStage.LEAD,
      amount: 100,
      currency: 'EUR',
    });

    const gruppen = await als(jonasId, {}, { 'deal.amount': 'verborgen' }, () =>
      deals.gruppen(workspaceId, { gruppierung: 'std:stage' }, {}),
    );

    expect(gruppen[0]).toMatchObject({ anzahl: 1, summen: [] });
  });

  it('respektiert die Zeilenrechte beim Zählen', async () => {
    await deals.create(workspaceId, {
      name: 'meins',
      stage: DealStage.LEAD,
      ownerId: jonasId,
    });
    await deals.create(workspaceId, {
      name: 'fremd',
      stage: DealStage.LEAD,
      ownerId: annaId,
    });

    const gruppen = await als(jonasId, { deal: 'eigene' }, {}, () =>
      deals.gruppen(workspaceId, { gruppierung: 'std:stage' }, {}),
    );

    expect(gruppen).toEqual([expect.objectContaining({ anzahl: 1 })]);
  });
});
