import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealKontaktEntity } from '../crm/entities/deal-kontakt.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { ImportEntity } from './dto/import.dto';
import { ImportService } from './import.service';

const SUITE = 'import';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: ImportService;
let customFields: CustomFieldsService;
let workspaceId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  customFields = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  service = new ImportService(dataSource, customFields);

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Probe', slug: 'probe' }))
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
  extra: {
    options?: string[];
    required?: boolean;
    standardwert?: string;
  } = {},
) =>
  customFields.create(workspaceId, {
    entity: CustomFieldEntity.COMPANY,
    label,
    type,
    ...extra,
  });

const importCompanies = (
  csv: string,
  mapping: { column: string; field: string }[],
  dryRun = false,
) =>
  service.run(workspaceId, {
    entity: ImportEntity.COMPANY,
    csv,
    mapping,
    dryRun,
  });

const companyNamed = (name: string) =>
  dataSource.getRepository(CompanyEntity).findOne({ where: { name } });

describe('importing into a custom field', () => {
  it('offers the workspace fields alongside the built-in ones', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);

    const definitions = await customFields.list(
      workspaceId,
      CustomFieldEntity.COMPANY,
    );

    expect(definitions.map((d) => d.key)).toContain('kundennummer');
  });

  it('stores a mapped column', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);

    const report = await importCompanies('Firma,Nummer\nNordwind GmbH,K-1\n', [
      { column: 'Firma', field: 'name' },
      { column: 'Nummer', field: 'custom:kundennummer' },
    ]);

    expect(report.created).toBe(1);
    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      kundennummer: 'K-1',
    });
  });

  it('reads the cell as the declared type', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);
    await define('Aktiv', CustomFieldType.BOOLEAN);

    await importCompanies('Firma,Anzahl,Aktiv\nNordwind GmbH,180,ja\n', [
      { column: 'Firma', field: 'name' },
      { column: 'Anzahl', field: 'custom:anzahl' },
      { column: 'Aktiv', field: 'custom:aktiv' },
    ]);

    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      anzahl: 180,
      aktiv: true,
    });
  });

  it('rejects only the row whose value does not fit', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    const report = await importCompanies(
      'Firma,Anzahl\nGut GmbH,180\nSchlecht GmbH,viele\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Anzahl', field: 'custom:anzahl' },
      ],
    );

    expect(report.created).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejections[0].row).toBe(3);
    expect(report.rejections[0].reason).toMatch(/Anzahl/);
    expect(await companyNamed('Gut GmbH')).not.toBeNull();
  });

  it('refuses a value outside a selection field', async () => {
    await define('Region', CustomFieldType.SELECT, {
      options: ['Nord', 'Sued'],
    });

    const report = await importCompanies(
      'Firma,Region\nNordwind GmbH,Mitte\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Region', field: 'custom:region' },
      ],
    );

    expect(report.created).toBe(0);
    expect(report.rejections[0].reason).toMatch(/Mitte/);
  });

  it('refuses a column mapped to a field nothing defines', async () => {
    await expect(
      importCompanies('Firma,X\nNordwind GmbH,1\n', [
        { column: 'Firma', field: 'name' },
        { column: 'X', field: 'custom:erfunden' },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a column mapped to an archived field', async () => {
    const field = await define('Kundennummer', CustomFieldType.TEXT);

    await customFields.archive(workspaceId, field.id);

    await expect(
      importCompanies('Firma,Nummer\nNordwind GmbH,K-1\n', [
        { column: 'Firma', field: 'name' },
        { column: 'Nummer', field: 'custom:kundennummer' },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('says once that a required field is unmapped, not once per row', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { required: true });

    await expect(
      importCompanies('Firma\nEine GmbH\nZwei GmbH\n', [
        { column: 'Firma', field: 'name' },
      ]),
    ).rejects.toThrow(/Kundennummer/);
  });
});

describe('Pflichtfelder mit Standardwert', () => {
  const status = () =>
    define('Status', CustomFieldType.SELECT, {
      options: ['Neu', 'Kunde'],
      required: true,
      standardwert: 'Neu',
    });

  it('verlangt keine Spalte, die Datensätze tragen den Standardwert', async () => {
    await status();

    const report = await importCompanies('Firma\nEine GmbH\nZwei GmbH\n', [
      { column: 'Firma', field: 'name' },
    ]);

    expect(report.created).toBe(2);
    expect((await companyNamed('Eine GmbH'))?.customFields).toEqual({
      status: 'Neu',
    });
    expect((await companyNamed('Zwei GmbH'))?.customFields).toEqual({
      status: 'Neu',
    });
  });

  it('setzt bei leerer Zelle in einem neuen Datensatz den Standardwert', async () => {
    await status();

    const report = await importCompanies(
      'Firma,Status\nEine GmbH,\nZwei GmbH,Kunde\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Status', field: 'custom:status' },
      ],
    );

    expect(report.created).toBe(2);
    expect(report.rejected).toBe(0);
    expect((await companyNamed('Eine GmbH'))?.customFields).toEqual({
      status: 'Neu',
    });
    expect((await companyNamed('Zwei GmbH'))?.customFields).toEqual({
      status: 'Kunde',
    });
  });

  it('verlangt ein Pflichtfeld ohne Standardwert weiter in jeder Zeile', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { required: true });

    const report = await importCompanies(
      'Firma,Nummer\nEine GmbH,\nZwei GmbH,K-2\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Nummer', field: 'custom:kundennummer' },
      ],
    );

    expect(report.created).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejections[0].reason).toMatch(/Kundennummer/);
  });

  it('lässt bei einer Dublette mit leerer Zelle den Wert stehen', async () => {
    await status();

    await importCompanies(
      'Firma,Domain,Status\nNordwind GmbH,nordwind.de,Kunde\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Status', field: 'custom:status' },
      ],
    );

    const report = await importCompanies(
      'Firma,Domain,Status\nNordwind GmbH,nordwind.de,\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Status', field: 'custom:status' },
      ],
    );

    expect(report.updated).toBe(1);
    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      status: 'Kunde',
    });
  });

  it('weist eine Dublette ohne Wert und mit leerer Zelle weiter ab', async () => {
    await importCompanies('Firma,Domain\nAlt GmbH,alt.de\n', [
      { column: 'Firma', field: 'name' },
      { column: 'Domain', field: 'domain' },
    ]);
    await status();

    const report = await importCompanies(
      'Firma,Domain,Status\nAlt GmbH,alt.de,\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Status', field: 'custom:status' },
      ],
    );

    expect(report.rejected).toBe(1);
    expect(report.rejections[0].reason).toMatch(/Status/);
  });
});

describe('importing over records that already exist', () => {
  it('keeps values the file has no column for', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);
    await define('Region', CustomFieldType.SELECT, {
      options: ['Nord', 'Sued'],
    });

    await importCompanies(
      'Firma,Domain,Nummer,Region\nNordwind GmbH,nordwind.de,K-1,Nord\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Nummer', field: 'custom:kundennummer' },
        { column: 'Region', field: 'custom:region' },
      ],
    );

    const second = await importCompanies(
      'Firma,Domain,Nummer\nNordwind GmbH,nordwind.de,K-2\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Nummer', field: 'custom:kundennummer' },
      ],
    );

    expect(second.updated).toBe(1);
    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      kundennummer: 'K-2',
      region: 'Nord',
    });
  });

  it('leaves custom values alone when no custom column is mapped at all', async () => {
    await define('Region', CustomFieldType.SELECT, { options: ['Nord'] });

    await importCompanies(
      'Firma,Domain,Region\nNordwind GmbH,nordwind.de,Nord\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Region', field: 'custom:region' },
      ],
    );

    await importCompanies('Firma,Domain\nNordwind GmbH,nordwind.de\n', [
      { column: 'Firma', field: 'name' },
      { column: 'Domain', field: 'domain' },
    ]);

    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      region: 'Nord',
    });
  });

  it('treats an empty cell as leaving the value alone, not clearing it', async () => {
    await define('Kundennummer', CustomFieldType.TEXT);

    await importCompanies(
      'Firma,Domain,Nummer\nNordwind GmbH,nordwind.de,K-1\n',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Nummer', field: 'custom:kundennummer' },
      ],
    );

    await importCompanies('Firma,Domain,Nummer\nNordwind GmbH,nordwind.de,\n', [
      { column: 'Firma', field: 'name' },
      { column: 'Domain', field: 'domain' },
      { column: 'Nummer', field: 'custom:kundennummer' },
    ]);

    expect((await companyNamed('Nordwind GmbH'))?.customFields).toEqual({
      kundennummer: 'K-1',
    });
  });
});

describe('the preview', () => {
  it('reports what committing would do, and changes nothing', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    const csv = 'Firma,Anzahl\nGut GmbH,180\nSchlecht GmbH,viele\n';
    const mapping = [
      { column: 'Firma', field: 'name' },
      { column: 'Anzahl', field: 'custom:anzahl' },
    ];

    const preview = await importCompanies(csv, mapping, true);

    expect(preview.dryRun).toBe(true);
    expect(await companyNamed('Gut GmbH')).toBeNull();

    const committed = await importCompanies(csv, mapping, false);

    expect({
      created: committed.created,
      updated: committed.updated,
      rejected: committed.rejected,
    }).toEqual({
      created: preview.created,
      updated: preview.updated,
      rejected: preview.rejected,
    });
  });
});

describe('reading a file this product exported', () => {
  it('imports a semicolon-separated file, which is what the export writes', async () => {
    const report = await importCompanies(
      'Firma;Stadt\r\nNordwind Logistik;Hamburg\r\nSuedwind KG;Muenchen',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Stadt', field: 'city' },
      ],
    );

    expect(report.created).toBe(2);
    expect(report.rejected).toBe(0);
  });

  it('still imports a comma-separated file from anywhere else', async () => {
    const report = await importCompanies(
      'Firma,Stadt\nNordwind Logistik,Hamburg',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Stadt', field: 'city' },
      ],
    );

    expect(report.created).toBe(1);
  });

  it('is not fooled by a comma inside a semicolon-separated file', async () => {
    const report = await importCompanies(
      'Firma;Stadt\r\n"Muster, Hans GmbH";Hamburg',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Stadt', field: 'city' },
      ],
    );

    expect(report.created).toBe(1);
    expect((await companyNamed('Muster, Hans GmbH'))?.city).toBe('Hamburg');
  });
});

describe('eine Zeile, an der die Datenbank scheitert', () => {
  it('lehnt nur diese Zeile ab, die übrigen werden gespeichert', async () => {
    const report = await importCompanies(
      `Firma;PLZ\nVorher GmbH;20095\nZu lang AG;${'1'.repeat(30)}\nNachher KG;80331`,
      [
        { column: 'Firma', field: 'name' },
        { column: 'PLZ', field: 'postalCode' },
      ],
    );

    expect(report.created).toBe(2);
    expect(report.rejections).toEqual([
      {
        row: 3,
        reason: 'Ein Text ist zu lang.',
        zellen: ['Zu lang AG', '1'.repeat(30)],
      },
    ]);
    expect(await companyNamed('Vorher GmbH')).not.toBeNull();
    expect(await companyNamed('Nachher KG')).not.toBeNull();
    expect(await companyNamed('Zu lang AG')).toBeNull();
  });

  it('prüft Grenzen und Tage, bevor die Datenbank es tut', async () => {
    const report = await importCompanies(
      'Firma;Umsatz;Leute\nRiesig;1000000000000000;\nMinus;-5;\nViele;;3000000000\nPasst;1.234,56;12',
      [
        { column: 'Firma', field: 'name' },
        { column: 'Umsatz', field: 'annualRevenue' },
        { column: 'Leute', field: 'employeeCount' },
      ],
    );

    expect(report.created).toBe(1);
    expect(report.rejections.map((eintrag) => eintrag.reason)).toEqual([
      'Jahresumsatz darf höchstens 999.999.999.999,99 betragen.',
      'Jahresumsatz darf nicht negativ sein.',
      'Mitarbeiter darf höchstens 2.147.483.647 betragen.',
    ]);
    expect(Number((await companyNamed('Passt'))?.annualRevenue)).toBe(1234.56);
  });
});

describe('Geschäfte mit Kontakten', () => {
  it('setzt den Hauptkontakt und hängt weitere Kontakte an, über die Adresse', async () => {
    const m = dataSource.manager;
    const [eva, tom] = await m.save([
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Eva',
        lastName: 'Haupt',
        email: 'eva@kunde.de',
      }),
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Tom',
        lastName: 'Weiter',
        email: 'tom@kunde.de',
      }),
    ]);

    const bericht = await service.run(workspaceId, {
      entity: ImportEntity.DEAL,
      csv:
        'Name;Haupt;Weitere\n' +
        'Rahmenvertrag;EVA@kunde.de;tom@kunde.de, eva@kunde.de\n' +
        'Unbekannt;niemand@kunde.de;\n',
      mapping: [
        { column: 'Name', field: 'name' },
        { column: 'Haupt', field: 'primaryContactEmail' },
        { column: 'Weitere', field: 'weitereKontakte' },
      ],
      dryRun: false,
    });

    expect(bericht.created).toBe(1);
    expect(bericht.rejections[0].reason).toContain('niemand@kunde.de');

    const deal = await m.findOneOrFail(DealEntity, {
      where: { workspaceId, name: 'Rahmenvertrag' },
    });

    expect(deal.primaryContactId).toBe(eva.id);
    expect(
      (await m.find(DealKontaktEntity, { where: { dealId: deal.id } })).map(
        (zeile) => zeile.contactId,
      ),
    ).toEqual([tom.id]);
  });
});
