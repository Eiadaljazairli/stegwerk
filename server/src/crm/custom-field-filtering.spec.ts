import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { berlinDate, instantFromBerlin } from '../calendar/berlin-time';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { CompanyEntity } from './entities/company.entity';

const SUITE = 'custom_field_filtering';

jest.setTimeout(60_000);

let dataSource: DataSource;
let companies: CompaniesService;
let customFields: CustomFieldsService;
let workspaceId: string;
let otherWorkspaceId: string;

const COMPANY = CustomFieldEntity.COMPANY;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  customFields = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  companies = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    customFields,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE companies, custom_fields CASCADE');
});

const define = (label: string, type: CustomFieldType, options: string[] = []) =>
  customFields.create(workspaceId, {
    entity: COMPANY,
    label,
    type,
    ...(options.length > 0 ? { options } : {}),
  });

const named = (page: { items: CompanyEntity[] }) =>
  page.items.map((company) => company.name);

describe('filtering', () => {
  it('matches on text', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'Treffer',
      customFields: { kundennummer: 'K-1' },
    });
    await companies.create(workspaceId, {
      name: 'Daneben',
      customFields: { kundennummer: 'K-2' },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'kundennummer', operator: Op.EQUALS, value: 'K-1' },
      ],
    });

    expect(named(page)).toEqual(['Treffer']);
  });

  it('matches a number as a number, not as its text', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);
    await companies.create(workspaceId, {
      name: 'Treffer',
      customFields: { anzahl: 180 },
    });
    await companies.create(workspaceId, {
      name: 'Daneben',
      customFields: { anzahl: 9 },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [{ key: 'anzahl', operator: Op.EQUALS, value: '180' }],
    });

    expect(named(page)).toEqual(['Treffer']);
  });

  it('matches true and false', async () => {
    await define('Aktiv', CustomFieldType.BOOLEAN);
    await companies.create(workspaceId, {
      name: 'Ja',
      customFields: { aktiv: true },
    });
    await companies.create(workspaceId, {
      name: 'Nein',
      customFields: { aktiv: false },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [{ key: 'aktiv', operator: Op.EQUALS, value: 'ja' }],
    });

    expect(named(page)).toEqual(['Ja']);
  });

  it('matches part of a text', async () => {
    await define('Notiz', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'Treffer',
      customFields: { notiz: 'Rahmenvertrag 2027' },
    });
    await companies.create(workspaceId, {
      name: 'Daneben',
      customFields: { notiz: 'Einzelauftrag' },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [{ key: 'notiz', operator: Op.CONTAINS, value: 'rahmen' }],
    });

    expect(named(page)).toEqual(['Treffer']);
  });

  it('compares numbers by size', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    for (const [name, anzahl] of [
      ['Klein', 9],
      ['Gross', 180],
    ] as const) {
      await companies.create(workspaceId, {
        name,
        customFields: { anzahl },
      });
    }

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'anzahl', operator: Op.GREATER_THAN, value: '10' },
      ],
    });

    expect(named(page)).toEqual(['Gross']);
  });

  it('compares dates by when they are', async () => {
    await define('Ende', CustomFieldType.DATE);
    await companies.create(workspaceId, {
      name: 'Bald',
      customFields: { ende: '2026-11-01' },
    });
    await companies.create(workspaceId, {
      name: 'Spaeter',
      customFields: { ende: '2028-01-15' },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'ende', operator: Op.LESS_THAN, value: '2027-01-01' },
      ],
    });

    expect(named(page)).toEqual(['Bald']);
  });

  it('finds records where the field was never filled in', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'Gefuellt',
      customFields: { kundennummer: 'K-1' },
    });
    await companies.create(workspaceId, { name: 'Leer' });

    const page = await companies.list(workspaceId, {
      customFilters: [{ key: 'kundennummer', operator: Op.IS_EMPTY }],
    });

    expect(named(page)).toEqual(['Leer']);
  });

  it('finds records where it was', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'Gefuellt',
      customFields: { kundennummer: 'K-1' },
    });
    await companies.create(workspaceId, { name: 'Leer' });

    const page = await companies.list(workspaceId, {
      customFilters: [{ key: 'kundennummer', operator: Op.IS_NOT_EMPTY }],
    });

    expect(named(page)).toEqual(['Gefuellt']);
  });

  it('counts a record without the field as not equal to anything', async () => {
    await define('Region', CustomFieldType.SELECT, ['Nord', 'Sued']);
    await companies.create(workspaceId, {
      name: 'Nord',
      customFields: { region: 'Nord' },
    });
    await companies.create(workspaceId, {
      name: 'Sued',
      customFields: { region: 'Sued' },
    });
    await companies.create(workspaceId, { name: 'Ohne' });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'region', operator: Op.NOT_EQUALS, value: 'Nord' },
      ],
    });

    expect(named(page).sort()).toEqual(['Ohne', 'Sued']);
  });

  it('combines filters, narrowing rather than widening', async () => {
    await define('Region', CustomFieldType.SELECT, ['Nord', 'Sued']);
    await define('Anzahl', CustomFieldType.NUMBER);
    await companies.create(workspaceId, {
      name: 'Beides',
      customFields: { region: 'Nord', anzahl: 500 },
    });
    await companies.create(workspaceId, {
      name: 'NurRegion',
      customFields: { region: 'Nord', anzahl: 5 },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'region', operator: Op.EQUALS, value: 'Nord' },
        { key: 'anzahl', operator: Op.GREATER_THAN, value: '100' },
      ],
    });

    expect(named(page)).toEqual(['Beides']);
  });

  it('stays inside the workspace', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'Unsere',
      customFields: { kundennummer: 'K-1' },
    });

    const theirService = companies;

    await customFields.create(otherWorkspaceId, {
      entity: COMPANY,
      label: 'Kundennummer',
      type: CustomFieldType.TEXT,
    });
    await theirService.create(otherWorkspaceId, {
      name: 'Fremde',
      customFields: { kundennummer: 'K-1' },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'kundennummer', operator: Op.EQUALS, value: 'K-1' },
      ],
    });

    expect(named(page)).toEqual(['Unsere']);
  });
});

describe('refusing a filter that cannot mean anything', () => {
  it('refuses a key nothing defines', async () => {
    await expect(
      companies.list(workspaceId, {
        customFilters: [{ key: 'erfunden', operator: Op.EQUALS, value: 'x' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a comparison the type does not support', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    await expect(
      companies.list(workspaceId, {
        customFilters: [{ key: 'anzahl', operator: Op.CONTAINS, value: '1' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a value that is not of the declared type', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    await expect(
      companies.list(workspaceId, {
        customFilters: [
          { key: 'anzahl', operator: Op.GREATER_THAN, value: 'viele' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a comparison with nothing to compare against', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);

    await expect(
      companies.list(workspaceId, {
        customFilters: [{ key: 'kundennummer', operator: Op.EQUALS }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a filter on a field that was archived', async () => {
    const field = await define('Kundennummer', CustomFieldType.TEXT);

    await customFields.archive(workspaceId, field.id);

    await expect(
      companies.list(workspaceId, {
        customFilters: [
          { key: 'kundennummer', operator: Op.EQUALS, value: 'K-1' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('sorting', () => {
  it('orders numbers by size, not by their first digit', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    for (const [name, anzahl] of [
      ['C', 9],
      ['A', 100],
      ['B', 20],
    ] as const) {
      await companies.create(workspaceId, { name, customFields: { anzahl } });
    }

    const page = await companies.list(workspaceId, {
      sortField: 'custom:anzahl',
    });

    expect(named(page)).toEqual(['C', 'B', 'A']);
  });

  it('orders descending when asked', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    for (const [name, anzahl] of [
      ['C', 9],
      ['A', 100],
    ] as const) {
      await companies.create(workspaceId, { name, customFields: { anzahl } });
    }

    const page = await companies.list(workspaceId, {
      sortField: 'custom:anzahl',
      sortDirection: 'DESC' as never,
    });

    expect(named(page)).toEqual(['A', 'C']);
  });

  it('orders yes before no rather than by the words', async () => {
    await define('Aktiv', CustomFieldType.BOOLEAN);
    await companies.create(workspaceId, {
      name: 'Nein',
      customFields: { aktiv: false },
    });
    await companies.create(workspaceId, {
      name: 'Ja',
      customFields: { aktiv: true },
    });

    const page = await companies.list(workspaceId, {
      sortField: 'custom:aktiv',
      sortDirection: 'DESC' as never,
    });

    expect(named(page)).toEqual(['Ja', 'Nein']);
  });

  it('orders dates chronologically', async () => {
    await define('Ende', CustomFieldType.DATE);

    for (const [name, ende] of [
      ['Zweitens', '2027-02-01'],
      ['Erstens', '2026-12-31'],
    ] as const) {
      await companies.create(workspaceId, { name, customFields: { ende } });
    }

    const page = await companies.list(workspaceId, {
      sortField: 'custom:ende',
    });

    expect(named(page)).toEqual(['Erstens', 'Zweitens']);
  });

  it('puts records that never filled it in last', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);
    await companies.create(workspaceId, {
      name: 'Hat',
      customFields: { anzahl: 5 },
    });
    await companies.create(workspaceId, { name: 'Ohne' });

    const page = await companies.list(workspaceId, {
      sortField: 'custom:anzahl',
    });

    expect(named(page)).toEqual(['Hat', 'Ohne']);
  });

  it('falls back to the default order for a field that is gone', async () => {
    const field = await define('Anzahl', CustomFieldType.NUMBER);

    await companies.create(workspaceId, { name: 'B GmbH' });
    await companies.create(workspaceId, { name: 'A GmbH' });
    await customFields.archive(workspaceId, field.id);

    const page = await companies.list(workspaceId, {
      sortField: 'custom:anzahl',
    });

    expect(named(page)).toEqual(['A GmbH', 'B GmbH']);
  });

  it('does not let a sort key reach the query as text', async () => {
    await companies.create(workspaceId, { name: 'A GmbH' });

    const page = await companies.list(workspaceId, {
      sortField: "custom:x'; DROP TABLE companies; --",
    });

    expect(named(page)).toEqual(['A GmbH']);
  });
});

describe('Standardfelder und relative Zeiträume', () => {
  const tageVonHeute = (tage: number): string =>
    new Date(Date.now() + tage * 86_400_000).toISOString().slice(0, 10);

  it('filtert eine Spalte wie ein eigenes Feld, ohne Groß/Klein', async () => {
    await companies.create(workspaceId, { name: 'Nord', city: 'Hamburg' });
    await companies.create(workspaceId, { name: 'Sued', city: 'München' });
    await companies.create(workspaceId, { name: 'Ohne' });

    const gleich = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:city', operator: Op.EQUALS, value: 'hamburg' },
      ],
    });
    const leer = await companies.list(workspaceId, {
      customFilters: [{ key: 'std:city', operator: Op.IS_EMPTY }],
    });

    expect(named(gleich)).toEqual(['Nord']);
    expect(named(leer)).toEqual(['Ohne']);
  });

  it('vergleicht Zahlenspalten als Zahlen', async () => {
    await companies.create(workspaceId, { name: 'Klein', employeeCount: 9 });
    await companies.create(workspaceId, { name: 'Gross', employeeCount: 120 });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:employeeCount', operator: Op.GREATER_THAN, value: '10' },
      ],
    });

    expect(named(page)).toEqual(['Gross']);
  });

  it('kennt beginnt mit und enthält nicht, mit % als Zeichen', async () => {
    await companies.create(workspaceId, { name: 'Alpha GmbH' });
    await companies.create(workspaceId, { name: 'Beta 100% AG' });
    await companies.create(workspaceId, { name: 'Alphorn KG' });

    const beginnt = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:name', operator: Op.STARTS_WITH, value: 'alp' },
      ],
      sortField: 'name',
    });
    const ohne = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:name', operator: Op.NOT_CONTAINS, value: '100%' },
      ],
      sortField: 'name',
    });

    expect(named(beginnt)).toEqual(['Alpha GmbH', 'Alphorn KG']);
    expect(named(ohne)).toEqual(['Alpha GmbH', 'Alphorn KG']);
  });

  it('findet Daten in den letzten und nächsten n Tagen', async () => {
    await define('Termin', CustomFieldType.DATE);
    await companies.create(workspaceId, {
      name: 'Gestern',
      customFields: { termin: tageVonHeute(-1) },
    });
    await companies.create(workspaceId, {
      name: 'Vormonat',
      customFields: { termin: tageVonHeute(-40) },
    });
    await companies.create(workspaceId, {
      name: 'Morgen',
      customFields: { termin: tageVonHeute(1) },
    });

    const letzte = await companies.list(workspaceId, {
      customFilters: [{ key: 'termin', operator: Op.IN_LAST_DAYS, value: '7' }],
    });
    const naechste = await companies.list(workspaceId, {
      customFilters: [{ key: 'termin', operator: Op.IN_NEXT_DAYS, value: '7' }],
    });
    const aelter = await companies.list(workspaceId, {
      customFilters: [
        { key: 'termin', operator: Op.OLDER_THAN_DAYS, value: '30' },
      ],
    });

    expect(named(letzte)).toEqual(['Gestern']);
    expect(named(naechste)).toEqual(['Morgen']);
    expect(named(aelter)).toEqual(['Vormonat']);
  });

  it('filtert Angelegt am relativ', async () => {
    await companies.create(workspaceId, { name: 'Neu' });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:createdAt', operator: Op.IN_LAST_DAYS, value: '1' },
      ],
    });

    expect(named(page)).toEqual(['Neu']);
  });

  it('rechnet „Angelegt am“ und „heute“ nach dem Tag in Berlin', async () => {
    const gestern = new Date(`${berlinDate(new Date())}T12:00:00Z`);

    gestern.setUTCDate(gestern.getUTCDate() - 1);

    const kurzNachMitternacht = new Date(
      instantFromBerlin(gestern.toISOString().slice(0, 10), '00:00').getTime() +
        30 * 60_000,
    );
    const firma = await companies.create(workspaceId, { name: 'Gestern früh' });

    await dataSource
      .getRepository(CompanyEntity)
      .update(firma.id, { createdAt: kurzNachMitternacht });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'std:createdAt', operator: Op.IN_LAST_DAYS, value: '1' },
      ],
    });
    const amTag = await companies.list(workspaceId, {
      customFilters: [
        {
          key: 'std:createdAt',
          operator: Op.EQUALS,
          value: gestern.toISOString().slice(0, 10),
        },
      ],
    });

    expect(named(page)).toEqual(['Gestern früh']);
    expect(named(amTag)).toEqual(['Gestern früh']);
  });

  it('lehnt eine unbekannte Spalte und eine unsinnige Tageszahl ab', async () => {
    await expect(
      companies.list(workspaceId, {
        customFilters: [
          { key: 'std:passwordHash', operator: Op.EQUALS, value: 'x' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      companies.list(workspaceId, {
        customFilters: [
          { key: 'std:createdAt', operator: Op.IN_LAST_DAYS, value: '-3' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
