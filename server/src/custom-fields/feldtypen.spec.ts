import { BadRequestException } from '@nestjs/common';
import { Kind, parseValue } from 'graphql';
import { type DataSource } from 'typeorm';

import { CompaniesService } from '../crm/companies.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { operatorPasst } from './custom-field-query';
import { CustomFieldValuesScalar } from './custom-field-values.scalar';
import { CustomFieldDefinition } from './custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from './custom-field.types';
import { CustomFieldsService } from './custom-fields.service';

const SUITE = 'b7_feldtypen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: CustomFieldsService;
let companies: CompaniesService;
let workspaceId: string;
let otherWorkspaceId: string;

const COMPANY = CustomFieldEntity.COMPANY;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  companies = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    service,
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

const define = (
  label: string,
  type: CustomFieldType,
  extra: Record<string, unknown> = {},
) => service.create(workspaceId, { entity: COMPANY, label, type, ...extra });

const check = (values: Record<string, unknown>) =>
  service.validate(workspaceId, COMPANY, values as never);

const named = (page: { items: CompanyEntity[] }) =>
  page.items.map((company) => company.name).sort();

describe('farbige Auswahl', () => {
  it('merkt sich die Farbe je Möglichkeit, grau zählt nicht', async () => {
    const field = await define('Region', CustomFieldType.SELECT, {
      options: ['Nord', 'Süd'],
      farben: [
        { option: 'Nord', farbe: 'blau' },
        { option: 'Süd', farbe: 'grau' },
        { option: 'Gibt es nicht', farbe: 'rot' },
      ],
    });

    expect(field.optionFarben).toEqual({ Nord: 'blau' });
    expect(field.farben).toEqual([{ option: 'Nord', farbe: 'blau' }]);
  });

  it('nimmt keine Farbe außerhalb der Palette', async () => {
    await expect(
      define('Region', CustomFieldType.SELECT, {
        options: ['Nord'],
        farben: [{ option: 'Nord', farbe: '#ff0000' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('behält Farben, wenn eine Möglichkeit dazukommt', async () => {
    const field = await define('Region', CustomFieldType.SELECT, {
      options: ['Nord'],
      farben: [{ option: 'Nord', farbe: 'gruen' }],
    });

    const updated = await service.update(workspaceId, field.id, {
      options: ['Nord', 'West'],
    });

    expect(updated.optionFarben).toEqual({ Nord: 'gruen' });
  });
});

describe('Mehrfachauswahl', () => {
  it('speichert eine Liste in der Reihenfolge der Definition, ohne Doppel', async () => {
    await define('Produkte', CustomFieldType.MULTI_SELECT, {
      options: ['A', 'B', 'C'],
    });

    expect(await check({ produkte: ['C', 'A', 'C'] })).toEqual({
      produkte: ['A', 'C'],
    });
  });

  it('liest Text mit Semikolons, wie ihn der Export schreibt', async () => {
    await define('Produkte', CustomFieldType.MULTI_SELECT, {
      options: ['A', 'B'],
    });

    expect(await check({ produkte: 'B; A' })).toEqual({
      produkte: ['A', 'B'],
    });
  });

  it('weist eine unbekannte Möglichkeit ab', async () => {
    await define('Produkte', CustomFieldType.MULTI_SELECT, {
      options: ['A'],
    });

    await expect(check({ produkte: ['A', 'Z'] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('weist eine Liste in einem einfachen Feld ab', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);

    await expect(check({ kundennummer: ['K-1'] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('filtert nach "enthält eines von" und "enthält nicht"', async () => {
    await define('Produkte', CustomFieldType.MULTI_SELECT, {
      options: ['A', 'B', 'C'],
    });
    await companies.create(workspaceId, {
      name: 'AB',
      customFields: { produkte: ['A', 'B'] },
    });
    await companies.create(workspaceId, {
      name: 'C',
      customFields: { produkte: ['C'] },
    });
    await companies.create(workspaceId, { name: 'Leer' });

    const eines = await companies.list(workspaceId, {
      customFilters: [
        { key: 'produkte', operator: Op.CONTAINS_ANY, value: '["B","C"]' },
      ],
    });
    const nicht = await companies.list(workspaceId, {
      customFilters: [
        { key: 'produkte', operator: Op.CONTAINS_NONE, value: 'A' },
      ],
    });

    expect(named(eines)).toEqual(['AB', 'C']);
    expect(named(nicht)).toEqual(['C', 'Leer']);
  });

  it('lässt "ist" bei einer Mehrfachauswahl nicht zu', () => {
    expect(operatorPasst(CustomFieldType.MULTI_SELECT, Op.EQUALS)).toBe(false);
    expect(operatorPasst(CustomFieldType.MULTI_SELECT, Op.CONTAINS_ANY)).toBe(
      true,
    );
    expect(operatorPasst(CustomFieldType.TEXT, Op.CONTAINS_ANY)).toBe(false);
  });
});

describe('Betrag', () => {
  it('führt Euro, wenn nichts anderes gesagt ist', async () => {
    expect((await define('Budget', CustomFieldType.CURRENCY)).waehrung).toBe(
      'EUR',
    );
    expect(
      (
        await define('Budget CH', CustomFieldType.CURRENCY, {
          waehrung: 'CHF',
        })
      ).waehrung,
    ).toBe('CHF');
    expect((await define('Notiz', CustomFieldType.TEXT)).waehrung).toBeNull();
  });

  it.each([
    ['1.234,50 €', 1234.5],
    ['1234.5', 1234.5],
    ['EUR 99', 99],
    [12.345, 12.35],
  ])('liest %p als %p', async (raw, expected) => {
    await define('Budget', CustomFieldType.CURRENCY);

    expect(await check({ budget: raw })).toEqual({ budget: expected });
  });

  it('weist Text ohne Betrag ab', async () => {
    await define('Budget', CustomFieldType.CURRENCY);

    await expect(check({ budget: 'viel' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('sortiert als Zahl, nicht als Text', async () => {
    await define('Budget', CustomFieldType.CURRENCY);
    await companies.create(workspaceId, {
      name: 'Neun',
      customFields: { budget: 9 },
    });
    await companies.create(workspaceId, {
      name: 'Zehn',
      customFields: { budget: 10 },
    });

    const page = await companies.list(workspaceId, {
      sortField: 'custom:budget',
    });

    expect(page.items.map((company) => company.name)).toEqual(['Neun', 'Zehn']);
  });
});

describe('Link, E-Mail, Telefon', () => {
  it('nimmt nur https-Links', async () => {
    await define('Webseite', CustomFieldType.URL);

    expect(await check({ webseite: 'https://stegwerk.com/a' })).toEqual({
      webseite: 'https://stegwerk.com/a',
    });

    for (const bad of [
      'http://stegwerk.com',
      'javascript:alert(1)',
      'stegwerk.com',
    ]) {
      await expect(check({ webseite: bad })).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('prüft eine E-Mail und speichert sie klein', async () => {
    await define('Rechnung an', CustomFieldType.EMAIL);

    expect(await check({ rechnung_an: ' Max@Firma.DE ' })).toEqual({
      rechnung_an: 'max@firma.de',
    });
    await expect(check({ rechnung_an: 'kein at' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('speichert eine Nummer ohne Trennzeichen, das Plus bleibt', async () => {
    await define('Zentrale', CustomFieldType.PHONE);

    expect(await check({ zentrale: '+49 (30) 123-45 67' })).toEqual({
      zentrale: '+49301234567',
    });
    await expect(check({ zentrale: '0170 ANRUFEN' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('findet eine Nummer, wie auch immer sie geschrieben ist', async () => {
    await define('Zentrale', CustomFieldType.PHONE);
    await companies.create(workspaceId, {
      name: 'Treffer',
      customFields: { zentrale: '030 / 12 34' },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'zentrale', operator: Op.EQUALS, value: '030-1234' },
      ],
    });

    expect(named(page)).toEqual(['Treffer']);
  });
});

describe('Bewertung', () => {
  it.each([[1], [5], ['3']])('nimmt %p', async (raw) => {
    await define('Potenzial', CustomFieldType.RATING);

    expect(await check({ potenzial: raw })).toEqual({
      potenzial: Number(raw),
    });
  });

  it.each([[0], [6], [2.5], ['viel']])('weist %p ab', async (raw) => {
    await define('Potenzial', CustomFieldType.RATING);

    await expect(check({ potenzial: raw })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('filtert mit größer als', async () => {
    await define('Potenzial', CustomFieldType.RATING);
    await companies.create(workspaceId, {
      name: 'Hoch',
      customFields: { potenzial: 5 },
    });
    await companies.create(workspaceId, {
      name: 'Niedrig',
      customFields: { potenzial: 2 },
    });

    const page = await companies.list(workspaceId, {
      customFilters: [
        { key: 'potenzial', operator: Op.GREATER_THAN, value: '3' },
      ],
    });

    expect(named(page)).toEqual(['Hoch']);
  });
});

describe('eindeutig', () => {
  it('weist denselben Wert an einem zweiten Datensatz ab', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { eindeutig: true });
    await companies.create(workspaceId, {
      name: 'Erste',
      customFields: { kundennummer: 'K-1' },
    });

    await expect(
      companies.create(workspaceId, {
        name: 'Zweite',
        customFields: { kundennummer: 'k-1' },
      }),
    ).rejects.toThrow(
      '"Kundennummer" muss eindeutig sein – „k-1“ gibt es schon.',
    );
  });

  it('lässt einen Datensatz seinen eigenen Wert behalten', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { eindeutig: true });
    const erste = await companies.create(workspaceId, {
      name: 'Erste',
      customFields: { kundennummer: 'K-1' },
    });

    await expect(
      companies.update(workspaceId, erste.id, {
        customFields: { kundennummer: 'K-1' },
      }),
    ).resolves.toBeDefined();
  });

  it('zählt den Papierkorb und andere Arbeitsbereiche nicht mit', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { eindeutig: true });
    await service.create(otherWorkspaceId, {
      entity: COMPANY,
      label: 'Kundennummer',
      type: CustomFieldType.TEXT,
      eindeutig: true,
    });
    await companies.create(otherWorkspaceId, {
      name: 'Fremd',
      customFields: { kundennummer: 'K-1' },
    });
    const geloescht = await companies.create(workspaceId, {
      name: 'Gelöscht',
      customFields: { kundennummer: 'K-2' },
    });
    await dataSource
      .getRepository(CompanyEntity)
      .softDelete({ id: geloescht.id });

    await expect(
      companies.create(workspaceId, {
        name: 'Neu',
        customFields: { kundennummer: 'K-1' },
      }),
    ).resolves.toBeDefined();
    await expect(
      companies.create(workspaceId, {
        name: 'Neu 2',
        customFields: { kundennummer: 'K-2' },
      }),
    ).resolves.toBeDefined();
  });

  it('wird nicht eindeutig, solange es Doppel gibt', async () => {
    const field = await define('Kundennummer', CustomFieldType.TEXT);
    await companies.create(workspaceId, {
      name: 'A',
      customFields: { kundennummer: 'K-1' },
    });
    await companies.create(workspaceId, {
      name: 'B',
      customFields: { kundennummer: 'K-1' },
    });

    await expect(
      service.update(workspaceId, field.id, { eindeutig: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('gibt es nicht für ja/nein, Sterne und Mehrfachauswahl', async () => {
    await expect(
      define('Aktiv', CustomFieldType.BOOLEAN, { eindeutig: true }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      define('Potenzial', CustomFieldType.RATING, { eindeutig: true }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Anschrift und Links', () => {
  it('speichert eine Anschrift aus Text und findet sie über jeden Teil', async () => {
    await define('Lieferadresse', CustomFieldType.ADDRESS);
    await companies.create(workspaceId, {
      name: 'Nord',
      customFields: { lieferadresse: 'Hafenstraße 1, 20457 Hamburg' },
    });
    await companies.create(workspaceId, {
      name: 'Süd',
      customFields: {
        lieferadresse: { strasse: 'Marienplatz 1', ort: 'München' },
      },
    });
    await companies.create(workspaceId, { name: 'Leer' });

    const hamburg = await companies.list(workspaceId, {
      customFilters: [
        { key: 'lieferadresse', operator: Op.CONTAINS, value: '2045' },
      ],
    });
    const nichtMuenchen = await companies.list(workspaceId, {
      customFilters: [
        { key: 'lieferadresse', operator: Op.NOT_CONTAINS, value: 'münchen' },
      ],
    });
    const teilname = await companies.list(workspaceId, {
      customFilters: [
        { key: 'lieferadresse', operator: Op.CONTAINS, value: 'strasse' },
      ],
    });
    const sortiert = await companies.list(workspaceId, {
      sortField: 'custom:lieferadresse',
    });

    expect(named(hamburg)).toEqual(['Nord']);
    expect(named(nichtMuenchen)).toEqual(['Leer', 'Nord']);
    expect(named(teilname)).toEqual([]);
    expect(sortiert.items.slice(0, 2).map((c) => c.name)).toEqual([
      'Nord',
      'Süd',
    ]);
  });

  it('speichert Links mit Bezeichnung und sucht in Adresse und Bezeichnung', async () => {
    await define('Profile', CustomFieldType.LINKS);
    const firma = await companies.create(workspaceId, {
      name: 'Nord',
      customFields: {
        profile: [
          { url: 'linkedin.com/company/nord', label: 'LinkedIn' },
          { url: 'https://nord.de' },
        ],
      },
    });

    expect(firma.customFields.profile).toEqual([
      { url: 'https://linkedin.com/company/nord', label: 'LinkedIn' },
      { url: 'https://nord.de/' },
    ]);

    const treffer = await companies.list(workspaceId, {
      customFilters: [
        { key: 'profile', operator: Op.CONTAINS, value: 'linkedin' },
      ],
    });

    expect(named(treffer)).toEqual(['Nord']);
    await expect(
      check({ profile: [{ url: 'javascript:alert(1)' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('kann nicht eindeutig sein und nicht mit "ist" gefiltert werden', async () => {
    await expect(
      define('Sitz', CustomFieldType.ADDRESS, { eindeutig: true }),
    ).rejects.toThrow(BadRequestException);
    expect(operatorPasst(CustomFieldType.ADDRESS, Op.EQUALS)).toBe(false);
    expect(operatorPasst(CustomFieldType.LINKS, Op.CONTAINS)).toBe(true);
  });
});

describe('Anzeige von Zahl und Datum', () => {
  it('merkt sich Stellen und Prozent nur bei Zahlen', async () => {
    const quote = await define('Quote', CustomFieldType.NUMBER, {
      nachkommastellen: 1,
      zahlformat: 'prozent',
    });

    expect(quote.nachkommastellen).toBe(1);
    expect(quote.zahlformat).toBe('prozent');

    const geaendert = await service.update(workspaceId, quote.id, {
      nachkommastellen: null,
    });

    expect(geaendert.nachkommastellen).toBeNull();
    expect(geaendert.zahlformat).toBe('prozent');
    await expect(
      define('Name2', CustomFieldType.TEXT, { zahlformat: 'prozent' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('liest „12,5 %“ in ein Prozentfeld als 12,5', async () => {
    await define('Rabatt', CustomFieldType.NUMBER, { zahlformat: 'prozent' });

    expect(await check({ rabatt: '12,5 %' })).toEqual({ rabatt: 12.5 });
  });

  it('merkt sich relativ nur bei Daten', async () => {
    const termin = await define('Verlängerung', CustomFieldType.DATE, {
      datumsformat: 'relativ',
    });

    expect(termin.datumsformat).toBe('relativ');
    await expect(
      define('Menge', CustomFieldType.NUMBER, { datumsformat: 'relativ' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('der Skalar', () => {
  it('nimmt eine Liste von Texten, aber keine verschachtelten Werte', () => {
    expect(
      CustomFieldValuesScalar.parseValue({ produkte: ['A', 'B'] }),
    ).toEqual({ produkte: ['A', 'B'] });
    expect(() =>
      CustomFieldValuesScalar.parseValue({ produkte: [1, 2] }),
    ).toThrow(BadRequestException);
    expect(() =>
      CustomFieldValuesScalar.parseValue({ produkte: { a: 1 } }),
    ).toThrow(BadRequestException);
    expect(() =>
      CustomFieldValuesScalar.parseValue({ sitz: { ort: { x: 'y' } } }),
    ).toThrow(BadRequestException);
    expect(
      CustomFieldValuesScalar.parseValue({
        sitz: { ort: 'Kiel' },
        links: [{ url: 'https://a.de', label: 'A' }],
      }),
    ).toEqual({
      sitz: { ort: 'Kiel' },
      links: [{ url: 'https://a.de', label: 'A' }],
    });
  });

  it('liest eine Liste auch als Literal', () => {
    const node = parseValue('{ produkte: ["A", "B"] }');

    expect(node.kind).toBe(Kind.OBJECT);
    expect(CustomFieldValuesScalar.parseLiteral(node)).toEqual({
      produkte: ['A', 'B'],
    });
  });
});
