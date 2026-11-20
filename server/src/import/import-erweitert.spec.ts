import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ProductEntity } from '../quotes/product.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { DealKontaktEntity } from '../crm/entities/deal-kontakt.entity';
import { MAX_DEAL_KONTAKTE } from '../crm/deal-kontakte.service';
import { runWithRequestContext } from '../observability/request-context';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { FreigabeEntity } from '../crm/freigaben/freigabe.entity';
import { ImportEntity } from './dto/import.dto';
import { ImportService } from './import.service';

const SUITE = 'import_erweitert';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: ImportService;
let felder: CustomFieldsService;
let workspaceId: string;
let annaId: string;
let benId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  service = new ImportService(dataSource, felder);

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Probe', slug: 'probe' })
  ).id;
  annaId = (
    await dataSource.getRepository(UserEntity).save({
      email: 'anna@wir.de',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Schmidt',
    })
  ).id;
  await dataSource.getRepository(MembershipEntity).save({
    workspaceId,
    userId: annaId,
    role: MembershipRole.OWNER,
  });
  benId = (
    await dataSource.getRepository(UserEntity).save({
      email: 'ben@wir.de',
      passwordHash: 'x',
      firstName: 'Ben',
      lastName: 'Weber',
    })
  ).id;
  await dataSource.getRepository(MembershipEntity).save({
    workspaceId,
    userId: benId,
    role: MembershipRole.MEMBER,
  });
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE companies, contacts, deals, notes, tasks, products, custom_fields CASCADE',
  );
});

const importiere = (
  entity: ImportEntity,
  csv: string,
  mapping: {
    column: string;
    field: string;
    werte?: { von: string; nach: string }[];
  }[],
  weiteres: {
    kopfzeile?: number;
    dryRun?: boolean;
    korrekturen?: never[];
  } = {},
) =>
  service.run(
    workspaceId,
    { entity, csv, mapping, dryRun: false, ...weiteres },
    annaId,
  );

describe('Kopfzeile', () => {
  it('überspringt, was über der Kopfzeile steht, und zählt die Zeilen mit', async () => {
    const csv =
      'Export vom 01.10.2026;\n;\nFirma;Ort\nNordwind;Kiel\n;Bremen\n';
    const blick = service.inspect(csv, 1);

    expect(blick.columns).toEqual(['Firma', 'Ort']);
    expect(blick.rowCount).toBe(2);
    expect(blick.vorschau[0]).toEqual(['Export vom 01.10.2026', '']);

    const bericht = await importiere(
      ImportEntity.COMPANY,
      csv,
      [
        { column: 'Firma', field: 'name' },
        { column: 'Ort', field: 'city' },
      ],
      { kopfzeile: 1 },
    );

    expect(bericht.created).toBe(1);
    expect(bericht.rejections.map((r) => r.row)).toEqual([4]);
  });

  it('nennt die verschiedenen Werte einer Spalte, häufigste zuerst', () => {
    const blick = service.inspect('Phase\nOffen\nGewonnen\nOffen\n\n');

    expect(blick.spaltenWerte).toEqual([
      { spalte: 'Phase', werte: ['Offen', 'Gewonnen'], mehr: false },
    ]);
  });
});

describe('Werte-Zuordnung', () => {
  it('liest Phasen unter ihrem Namen und ordnet fremde Werte zu', async () => {
    const bericht = await importiere(
      ImportEntity.DEAL,
      'Name;Phase\nA;Angebot\nB;Won\nC;Offen\n',
      [
        { column: 'Name', field: 'name' },
        {
          column: 'Phase',
          field: 'stage',
          werte: [
            { von: 'won', nach: 'won' },
            { von: 'Offen', nach: 'lead' },
          ],
        },
      ],
    );

    expect(bericht.created).toBe(3);

    const phasen = await dataSource
      .getRepository(DealEntity)
      .find({ order: { name: 'ASC' } });

    expect(phasen.map((g) => g.stage)).toEqual([
      DealStage.PROPOSAL,
      DealStage.WON,
      DealStage.LEAD,
    ]);
  });

  it('ordnet die Werte eines Auswahlfelds zu, auch in einer Mehrfachauswahl', async () => {
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Region',
      type: CustomFieldType.SELECT,
      options: ['Nord', 'Süd'],
    });
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Produkte',
      type: CustomFieldType.MULTI_SELECT,
      options: ['Beratung', 'Wartung'],
    });

    const bericht = await importiere(
      ImportEntity.COMPANY,
      'Name;Gebiet;Leistungen\nNordwind;N;"B;W"\n',
      [
        { column: 'Name', field: 'name' },
        {
          column: 'Gebiet',
          field: 'custom:region',
          werte: [{ von: 'n', nach: 'Nord' }],
        },
        {
          column: 'Leistungen',
          field: 'custom:produkte',
          werte: [
            { von: 'B', nach: 'Beratung' },
            { von: 'W', nach: 'Wartung' },
          ],
        },
      ],
    );

    expect(bericht.rejected).toBe(0);

    const firma = await dataSource
      .getRepository(CompanyEntity)
      .findOneByOrFail({ name: 'Nordwind' });

    expect(firma.customFields).toEqual({
      region: 'Nord',
      produkte: ['Beratung', 'Wartung'],
    });
  });
});

describe('Korrektur im Browser', () => {
  it('nimmt korrigierte Zellen statt der aus der Datei', async () => {
    const csv = 'Name;Mitarbeiter\nNordwind;viele\n';
    const zuordnung = [
      { column: 'Name', field: 'name' },
      { column: 'Mitarbeiter', field: 'employeeCount' },
    ];
    const vorher = await importiere(ImportEntity.COMPANY, csv, zuordnung, {
      dryRun: true,
    });

    expect(vorher.rejections[0]).toMatchObject({
      row: 2,
      zellen: ['Nordwind', 'viele'],
    });

    const nachher = await service.run(
      workspaceId,
      {
        entity: ImportEntity.COMPANY,
        csv,
        mapping: zuordnung,
        dryRun: false,
        korrekturen: [{ zeile: 2, zellen: ['Nordwind', '40'] }],
      },
      annaId,
    );

    expect(nachher.created).toBe(1);
    expect(
      (
        await dataSource
          .getRepository(CompanyEntity)
          .findOneByOrFail({ name: 'Nordwind' })
      ).employeeCount,
    ).toBe(40);
  });
});

describe('Notizen, Aufgaben, Artikel', () => {
  it('hängt Notizen an vorhandene Firmen und Kontakte, legt keine an', async () => {
    const firma = await dataSource
      .getRepository(CompanyEntity)
      .save({ workspaceId, name: 'Nordwind' });

    await dataSource.getRepository(ContactEntity).save({
      workspaceId,
      firstName: 'Bo',
      lastName: 'Berg',
      email: 'bo@nordwind.de',
      companyId: firma.id,
    });

    const bericht = await importiere(
      ImportEntity.NOTE,
      'Text;Firma;Kontakt\nRückruf;nordwind;\nAngebot;;BO@nordwind.de\nX;Südwind;\nY;;\n',
      [
        { column: 'Text', field: 'body' },
        { column: 'Firma', field: 'companyRef' },
        { column: 'Kontakt', field: 'contactRef' },
      ],
    );

    expect(bericht.created).toBe(2);
    expect(bericht.rejections.map((r) => r.reason)).toEqual([
      'Die Firma „Südwind“ gibt es nicht.',
      'Eine Notiz braucht eine Firma, einen Kontakt oder ein Geschäft.',
    ]);
    expect(await dataSource.getRepository(CompanyEntity).count()).toBe(1);

    const notizen = await dataSource.getRepository(NoteEntity).find();

    expect(notizen.every((n) => n.authorId === annaId)).toBe(true);
  });

  it('liest Aufgaben mit Fälligkeit, Zuständiger und erledigt', async () => {
    const bericht = await importiere(
      ImportEntity.TASK,
      'Titel;Fällig;Wer;Erledigt\nNachfassen;01.11.2026;anna@wir.de;nein\nAlt;;;ja\nFremd;;nie@da.de;\n',
      [
        { column: 'Titel', field: 'title' },
        { column: 'Fällig', field: 'dueDate' },
        { column: 'Wer', field: 'assigneeEmail' },
        { column: 'Erledigt', field: 'erledigt' },
      ],
    );

    expect(bericht.created).toBe(2);
    expect(bericht.rejections[0].reason).toBe(
      '„nie@da.de“ ist kein Mitglied dieses Bereichs.',
    );

    const aufgaben = await dataSource
      .getRepository(TaskEntity)
      .find({ order: { title: 'ASC' } });

    expect(
      aufgaben.map((a) => [a.title, a.dueDate, a.completedAt !== null]),
    ).toEqual([
      ['Alt', null, true],
      ['Nachfassen', '2026-11-01', false],
    ]);
    expect(aufgaben.every((a) => a.assigneeId === annaId)).toBe(true);
  });

  it('liest Artikel und aktualisiert sie beim zweiten Mal über die Nummer', async () => {
    const zuordnung = [
      { column: 'Nr', field: 'articleNumber' },
      { column: 'Name', field: 'name' },
      { column: 'Preis', field: 'unitPriceCents' },
      { column: 'Einheit', field: 'unit' },
      { column: 'MwSt', field: 'taxRatePercent' },
    ];

    const erst = await importiere(
      ImportEntity.PRODUCT,
      'Nr;Name;Preis;Einheit;MwSt\nA-1;Beratung;95,50;stunde;19 %\nA-2;Fass;10;Fass;19\n',
      zuordnung,
    );

    expect(erst.created).toBe(1);
    expect(erst.rejections[0].reason).toMatch(/keine Einheit/u);

    const dann = await importiere(
      ImportEntity.PRODUCT,
      'Nr;Name;Preis;Einheit;MwSt\na-1;Beratung neu;100;Stunde;7\n',
      zuordnung,
    );

    expect(dann.updated).toBe(1);

    const artikel = await dataSource
      .getRepository(ProductEntity)
      .findOneByOrFail({ articleNumber: 'A-1' });

    expect([
      artikel.name,
      artikel.unitPriceCents,
      artikel.unit,
      artikel.taxRatePercent,
    ]).toEqual(['Beratung neu', 10000, 'Stunde', 7]);
  });
});

describe('Verantwortlich und Muttergesellschaft', () => {
  it('ordnet Verantwortliche über die E-Mail zu und hängt Töchter an', async () => {
    const bericht = await importiere(
      ImportEntity.COMPANY,
      'Name;Mutter;Zuständig;Herkunft\nHolding;;;\nTochter;Holding;anna@wir.de;\nSelbst;Selbst;;\n',
      [
        { column: 'Name', field: 'name' },
        { column: 'Mutter', field: 'parentCompanyName' },
        { column: 'Zuständig', field: 'ownerEmail' },
      ],
    );

    expect(bericht.created).toBe(2);
    expect(bericht.rejections[0].reason).toMatch(/eigene Muttergesellschaft/u);

    const firmen = dataSource.getRepository(CompanyEntity);
    const tochter = await firmen.findOneByOrFail({ name: 'Tochter' });
    const holding = await firmen.findOneByOrFail({ name: 'Holding' });

    expect(tochter.parentCompanyId).toBe(holding.id);
    expect(tochter.ownerId).toBe(annaId);
    expect(tochter.herkunft).toBe('import');
    expect(holding.herkunft).toBe('import');
  });

  it('bietet Phasen mit den Namen des Bereichs an', async () => {
    const felderDeals = await service.felder(workspaceId, ImportEntity.DEAL);
    const phase = felderDeals.find((f) => f.name === 'stage');

    expect(phase?.optionen?.find((o) => o.wert === 'proposal')?.label).toBe(
      'Angebot',
    );
  });
});

const alsBen = <T>(tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test', userId: benId }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich: benId,
        arten: { company: 'eigene', contact: 'eigene', deal: 'alle' },
        felder: {},
      }),
    );

    return tun();
  });

const importiereAlsBen = (
  entity: ImportEntity,
  csv: string,
  mapping: { column: string; field: string }[],
) =>
  alsBen(() =>
    service.run(workspaceId, { entity, csv, mapping, dryRun: false }, benId),
  );

describe('Dubletten hinter den Zeilenrechten', () => {
  it('überschreibt und übernimmt keine fremde Firma, weder über Domain noch Name', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const fremd = await firmen.save({
      workspaceId,
      name: 'Nordwind',
      domain: 'nordwind.de',
      ownerId: annaId,
    });
    const eigene = await firmen.save({
      workspaceId,
      name: 'Eigen',
      domain: 'eigen.de',
      ownerId: benId,
    });

    const bericht = await importiereAlsBen(
      ImportEntity.COMPANY,
      'Name;Domain;Zuständig\nX;nordwind.de;ben@wir.de\nNordwind;;ben@wir.de\nEigen neu;eigen.de;\n',
      [
        { column: 'Name', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Zuständig', field: 'ownerEmail' },
      ],
    );

    expect(bericht.rejected).toBe(2);
    expect(bericht.updated).toBe(1);
    expect(bericht.created).toBe(0);

    const danach = await firmen.findOneByOrFail({ id: fremd.id });

    expect([danach.name, danach.ownerId]).toEqual(['Nordwind', annaId]);
    expect((await firmen.findOneByOrFail({ id: eigene.id })).name).toBe(
      'Eigen neu',
    );
    expect(await firmen.count()).toBe(2);
  });

  it('überschreibt keinen fremden Kontakt, weder über die Adresse noch über eine weitere', async () => {
    const kontakte = dataSource.getRepository(ContactEntity);
    const fremd = await kontakte.save({
      workspaceId,
      firstName: 'Eva',
      lastName: 'Fremd',
      email: 'eva@kunde.de',
      weitereEmails: [{ art: 'sonstige', wert: 'eva.privat@kunde.de' }],
      ownerId: annaId,
    });

    const bericht = await importiereAlsBen(
      ImportEntity.CONTACT,
      'Vorname;Nachname;Mail\nX;Y;eva@kunde.de\nX;Y;eva.privat@kunde.de\n',
      [
        { column: 'Vorname', field: 'firstName' },
        { column: 'Nachname', field: 'lastName' },
        { column: 'Mail', field: 'email' },
      ],
    );

    expect(bericht.rejected).toBe(2);

    const danach = await kontakte.findOneByOrFail({ id: fremd.id });

    expect([danach.firstName, danach.ownerId]).toEqual(['Eva', annaId]);
    expect(await kontakte.count()).toBe(1);
  });
});

describe('Sichtbare Dublette neben einer verborgenen', () => {
  it('aktualisiert die sichtbare Firma, auch wenn eine fremde gleich heißt', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const fremde = await firmen.save([
      { workspaceId, name: 'Hafen', ownerId: annaId },
      { workspaceId, name: 'Hafen', ownerId: annaId },
    ]);
    const eigene = await firmen.save({
      workspaceId,
      name: 'Hafen',
      ownerId: benId,
    });
    const unzugeordnet = await firmen.save({
      workspaceId,
      name: 'Kai',
      domain: 'kai-alt.de',
    });
    await firmen.save({ workspaceId, name: 'Kai', ownerId: annaId });

    const bericht = await importiereAlsBen(
      ImportEntity.COMPANY,
      'Name;Ort\nHafen;Kiel\nKai;Husum\n',
      [
        { column: 'Name', field: 'name' },
        { column: 'Ort', field: 'city' },
      ],
    );

    expect([bericht.updated, bericht.rejected, bericht.created]).toEqual([
      2, 0, 0,
    ]);
    expect((await firmen.findOneByOrFail({ id: eigene.id })).city).toBe('Kiel');
    expect((await firmen.findOneByOrFail({ id: unzugeordnet.id })).city).toBe(
      'Husum',
    );

    for (const fremd of fremde) {
      expect((await firmen.findOneByOrFail({ id: fremd.id })).city).toBeNull();
    }
  });

  it('nimmt die sichtbare Firma mit der Domain als weiterer statt der verborgenen mit Hauptdomain', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const fremd = await firmen.save({
      workspaceId,
      name: 'Möwe Alt',
      domain: 'moewe.de',
      ownerId: annaId,
    });
    const eigene = await firmen.save({
      workspaceId,
      name: 'Möwe',
      domain: 'moewe-neu.de',
      zweitdomains: ['moewe.de'],
      ownerId: benId,
    });

    const bericht = await importiereAlsBen(
      ImportEntity.COMPANY,
      'Name;Domain;Ort\nMöwe;moewe.de;Emden\n',
      [
        { column: 'Name', field: 'name' },
        { column: 'Domain', field: 'domain' },
        { column: 'Ort', field: 'city' },
      ],
    );

    expect([bericht.updated, bericht.rejected]).toEqual([1, 0]);
    expect((await firmen.findOneByOrFail({ id: eigene.id })).city).toBe(
      'Emden',
    );
    expect((await firmen.findOneByOrFail({ id: fremd.id })).city).toBeNull();
  });

  it('nimmt den sichtbaren Kontakt mit der Adresse als weiterer statt des verborgenen', async () => {
    const kontakte = dataSource.getRepository(ContactEntity);
    const fremd = await kontakte.save({
      workspaceId,
      firstName: 'Eva',
      lastName: 'Fremd',
      email: 'eva@kunde.de',
      ownerId: annaId,
    });
    const eigene = await kontakte.save({
      workspaceId,
      firstName: 'Eva',
      lastName: 'Eigen',
      email: 'eva.neu@kunde.de',
      weitereEmails: [{ art: 'sonstige', wert: 'eva@kunde.de' }],
      ownerId: benId,
    });

    const bericht = await importiereAlsBen(
      ImportEntity.CONTACT,
      'Vorname;Nachname;Mail\nEvelyn;Eigen;eva@kunde.de\n',
      [
        { column: 'Vorname', field: 'firstName' },
        { column: 'Nachname', field: 'lastName' },
        { column: 'Mail', field: 'email' },
      ],
    );

    expect([bericht.updated, bericht.rejected]).toEqual([1, 0]);
    expect((await kontakte.findOneByOrFail({ id: eigene.id })).firstName).toBe(
      'Evelyn',
    );
    expect((await kontakte.findOneByOrFail({ id: fremd.id })).firstName).toBe(
      'Eva',
    );
  });
});

describe('Muttergesellschaft beim Import', () => {
  const mutterSpalten = [
    { column: 'Name', field: 'name' },
    { column: 'Mutter', field: 'parentCompanyName' },
  ];

  it('lässt keinen Kreis entstehen, auch nicht innerhalb einer Datei', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const a = await firmen.save({ workspaceId, name: 'A GmbH' });
    const b = await firmen.save({ workspaceId, name: 'B AG' });

    const bericht = await importiere(
      ImportEntity.COMPANY,
      'Name;Mutter\nA GmbH;B AG\nB AG;A GmbH\n',
      mutterSpalten,
    );

    expect(bericht.updated).toBe(1);
    expect(bericht.rejections.map((r) => r.row)).toEqual([3]);
    expect(bericht.rejections[0].reason).toMatch(/Kreis/u);
    expect((await firmen.findOneByOrFail({ id: a.id })).parentCompanyId).toBe(
      b.id,
    );
    expect(
      (await firmen.findOneByOrFail({ id: b.id })).parentCompanyId,
    ).toBeNull();
  });

  it('lehnt einen Kreis mit dem Bestand ab', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const b = await firmen.save({ workspaceId, name: 'B AG' });

    await firmen.save({ workspaceId, name: 'A GmbH', parentCompanyId: b.id });

    const bericht = await importiere(
      ImportEntity.COMPANY,
      'Name;Mutter\nB AG;A GmbH\n',
      mutterSpalten,
    );

    expect(bericht.rejected).toBe(1);
    expect(
      (await firmen.findOneByOrFail({ id: b.id })).parentCompanyId,
    ).toBeNull();
  });

  it('verknüpft keine verborgene Mutter und legt keine neue an', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);

    await firmen.save({
      workspaceId,
      name: 'Geheim Holding',
      ownerId: annaId,
    });

    const bericht = await importiereAlsBen(
      ImportEntity.COMPANY,
      'Name;Mutter\nTochter;Geheim Holding\nZweite;Unbekannt AG\n',
      mutterSpalten,
    );

    expect(bericht.rejected).toBe(2);
    expect(bericht.rejections.map((r) => r.reason)).toEqual([
      'Die Firma „Geheim Holding“ gibt es nicht.',
      'Die Firma „Unbekannt AG“ gibt es nicht.',
    ]);
    expect(await firmen.count()).toBe(1);
  });
});

describe('Weitere Kontakte am Geschäft', () => {
  it('hält die Obergrenze der Beteiligten ein', async () => {
    const kontakte = dataSource.getRepository(ContactEntity);
    const adressen: string[] = [];

    for (let i = 0; i < MAX_DEAL_KONTAKTE + 10; i += 1) {
      adressen.push(`k${String(i)}@kunde.de`);
    }

    await kontakte.save(
      adressen.map((email) => ({
        workspaceId,
        firstName: 'K',
        lastName: email,
        email,
      })),
    );

    const bericht = await importiere(
      ImportEntity.DEAL,
      `Name;Weitere\nZu viele;${adressen.join(', ')}\nPasst;${adressen.slice(0, MAX_DEAL_KONTAKTE).join(', ')}\n`,
      [
        { column: 'Name', field: 'name' },
        { column: 'Weitere', field: 'weitereKontakte' },
      ],
    );

    expect(bericht.created).toBe(1);
    expect(bericht.rejections[0].reason).toMatch(/höchstens 50/u);
    expect(
      await dataSource.getRepository(DealEntity).countBy({ name: 'Zu viele' }),
    ).toBe(0);
    expect(await dataSource.getRepository(DealKontaktEntity).count()).toBe(
      MAX_DEAL_KONTAKTE,
    );
  });
});

describe('Freigaben beim Import (sichtbarkeit.ts, Regel 5 und 9)', () => {
  const importiereMitFreigabe = async (
    stufe: 'lesen' | 'bearbeiten',
    ids: { firmaId?: string; kontaktId?: string },
    entity: ImportEntity,
    csv: string,
    mapping: { column: string; field: string }[],
  ) => {
    const tabelle = dataSource.getRepository(FreigabeEntity);

    await tabelle.delete({ workspaceId });
    await tabelle.save(
      [
        ...(ids.firmaId === undefined
          ? []
          : [{ art: 'company' as const, datensatzId: ids.firmaId }]),
        ...(ids.kontaktId === undefined
          ? []
          : [{ art: 'contact' as const, datensatzId: ids.kontaktId }]),
      ].map((eintrag) => ({ ...eintrag, workspaceId, userId: benId, stufe })),
    );

    return runWithRequestContext({ requestId: 'test', userId: benId }, () => {
      setzeSichtfeld(() =>
        Promise.resolve({
          ich: benId,
          arten: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
          felder: {},
          freigaben: {
            company: new Map(
              ids.firmaId === undefined ? [] : [[ids.firmaId, stufe]],
            ),
            contact: new Map(
              ids.kontaktId === undefined ? [] : [[ids.kontaktId, stufe]],
            ),
          },
        }),
      );

      return service.run(
        workspaceId,
        { entity, csv, mapping, dryRun: false },
        benId,
      );
    });
  };

  const FIRMA = [
    { column: 'Name', field: 'name' },
    { column: 'Ort', field: 'city' },
    { column: 'Zuständig', field: 'ownerEmail' },
  ];

  it('überschreibt keine nur zum Lesen freigegebene Firma und keinen Kontakt', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const kontakte = dataSource.getRepository(ContactEntity);
    const firma = await firmen.save({
      workspaceId,
      name: 'Nordwind',
      ownerId: annaId,
    });
    const kontakt = await kontakte.save({
      workspaceId,
      firstName: 'Eva',
      lastName: 'Fremd',
      email: 'eva@kunde.de',
      ownerId: annaId,
    });

    const bericht = await importiereMitFreigabe(
      'lesen',
      { firmaId: firma.id },
      ImportEntity.COMPANY,
      'Name;Ort;Zuständig\nNordwind;Kiel;\nNordwind;;ben@wir.de\n',
      FIRMA,
    );

    expect([bericht.updated, bericht.created, bericht.rejected]).toEqual([
      0, 0, 2,
    ]);
    expect(bericht.rejections[0].reason).toMatch(/nur zum Lesen freigegeben/u);

    const danach = await firmen.findOneByOrFail({ id: firma.id });

    expect([danach.city, danach.ownerId]).toEqual([null, annaId]);

    const kontaktBericht = await importiereMitFreigabe(
      'lesen',
      { kontaktId: kontakt.id },
      ImportEntity.CONTACT,
      'Vorname;Nachname;Mail\nX;Y;eva@kunde.de\n',
      [
        { column: 'Vorname', field: 'firstName' },
        { column: 'Nachname', field: 'lastName' },
        { column: 'Mail', field: 'email' },
      ],
    );

    expect(kontaktBericht.rejected).toBe(1);
    expect((await kontakte.findOneByOrFail({ id: kontakt.id })).firstName).toBe(
      'Eva',
    );
    expect(await kontakte.count()).toBe(1);
  });

  it('mit „bearbeiten“ ändert er Felder, aber nicht den Verantwortlichen', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const firma = await firmen.save({
      workspaceId,
      name: 'Nordwind',
      ownerId: annaId,
    });

    const bericht = await importiereMitFreigabe(
      'bearbeiten',
      { firmaId: firma.id },
      ImportEntity.COMPANY,
      'Name;Ort;Zuständig\nNordwind;;ben@wir.de\nNordwind;Kiel;\nNordwind;Husum;anna@wir.de\n',
      FIRMA,
    );

    expect([bericht.updated, bericht.rejected]).toEqual([2, 1]);
    expect(bericht.rejections[0]).toEqual(
      expect.objectContaining({
        row: 2,
        reason: expect.stringMatching(/Den Verantwortlichen ändert/u),
      }),
    );

    const danach = await firmen.findOneByOrFail({ id: firma.id });

    expect([danach.city, danach.ownerId]).toEqual(['Husum', annaId]);
  });

  it('hängt Notizen und Aufgaben nicht an eine nur lesbare Akte', async () => {
    const firma = await dataSource
      .getRepository(CompanyEntity)
      .save({ workspaceId, name: 'Nordwind', ownerId: annaId });

    const notizen = await importiereMitFreigabe(
      'lesen',
      { firmaId: firma.id },
      ImportEntity.NOTE,
      'Text;Firma\nRückruf;Nordwind\n',
      [
        { column: 'Text', field: 'body' },
        { column: 'Firma', field: 'companyRef' },
      ],
    );
    const aufgaben = await importiereMitFreigabe(
      'lesen',
      { firmaId: firma.id },
      ImportEntity.TASK,
      'Titel;Firma\nNachfassen;Nordwind\n',
      [
        { column: 'Titel', field: 'title' },
        { column: 'Firma', field: 'companyRef' },
      ],
    );

    for (const bericht of [notizen, aufgaben]) {
      expect([bericht.created, bericht.rejected]).toEqual([0, 1]);
      expect(bericht.rejections[0].reason).toMatch(
        /nur zum Lesen freigegeben/u,
      );
    }

    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);

    const erlaubt = await importiereMitFreigabe(
      'bearbeiten',
      { firmaId: firma.id },
      ImportEntity.NOTE,
      'Text;Firma\nRückruf;Nordwind\n',
      [
        { column: 'Text', field: 'body' },
        { column: 'Firma', field: 'companyRef' },
      ],
    );

    expect(erlaubt.created).toBe(1);
  });
});
