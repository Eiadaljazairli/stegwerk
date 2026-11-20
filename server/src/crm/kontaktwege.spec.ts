import { ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { type AuditLogEntity } from '../audit/audit-log.entity';
import { AuditResolver } from '../audit/audit.resolver';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ExportService } from '../export/export.service';
import { ImportEntity } from '../import/dto/import.dto';
import { ImportService } from '../import/import.service';
import {
  type IncomingMessage,
  type MailReader,
  type ReadResult,
} from '../mailboxes/imap-reader';
import { MailMessageEntity } from '../mailboxes/mail-message.entity';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { runWithRequestContext } from '../observability/request-context';
import { ordneEmpfaenger } from '../serienmails/serienmails.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { verbirgListe } from '../workspaces/feld-middleware';
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
import { DublettenService } from './dubletten.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import {
  bereinigeEmails,
  bereinigeTelefone,
  kontaktwegeVereinen,
  normalisiereTelefon,
} from './kontaktwege';

const SUITE = 'e1_kontaktwege';
const SCHLUESSEL = randomBytes(32).toString('base64');

jest.setTimeout(60_000);

describe('Normalisieren', () => {
  it('schreibt deutsche Nummern in E.164 und lässt Unlesbares stehen', () => {
    expect(normalisiereTelefon('030 1234567')).toBe('+49301234567');
    expect(normalisiereTelefon('+49 (0)171 / 123 45 67')).toBe('+491711234567');
    expect(normalisiereTelefon('0043 1 5123456')).toBe('+4315123456');
    expect(normalisiereTelefon('Durchwahl 12')).toBe('Durchwahl 12');
    expect(normalisiereTelefon('  ')).toBe('');
  });

  it('bereinigt die Listen: klein, ohne Doppelte, ohne Hauptwert', () => {
    expect(
      bereinigeEmails(
        [
          { art: 'privat', wert: ' Anna@Privat.DE ' },
          { art: 'arbeit', wert: 'anna@privat.de' },
          { art: 'arbeit', wert: 'ANNA@nordwind.de' },
          { art: 'unsinn', wert: 'zweit@nordwind.de' },
        ],
        'anna@nordwind.de',
      ),
    ).toEqual([
      { art: 'privat', wert: 'anna@privat.de' },
      { art: 'sonstige', wert: 'zweit@nordwind.de' },
    ]);
    expect(() =>
      bereinigeEmails([{ art: 'privat', wert: 'keine-adresse' }], null),
    ).toThrow('keine E-Mail-Adresse');
    expect(
      bereinigeTelefone(
        [
          { art: 'mobil', wert: '0171 1234567' },
          { art: 'festnetz', wert: '+49 30 1234567' },
        ],
        '030/1234567',
      ),
    ).toEqual([{ art: 'mobil', wert: '+491711234567' }]);
  });

  it('nimmt beim Zusammenführen alles vom anderen mit', () => {
    expect(
      kontaktwegeVereinen(
        {
          email: 'a@x.de',
          phone: '+49301',
          weitereEmails: [{ art: 'privat', wert: 'a@privat.de' }],
          weitereTelefone: [],
        },
        {
          email: 'a.alt@x.de',
          phone: '0171 1234567',
          weitereEmails: [{ art: 'privat', wert: 'a@privat.de' }],
          weitereTelefone: [],
        },
      ),
    ).toEqual({
      weitereEmails: [
        { art: 'privat', wert: 'a@privat.de' },
        { art: 'sonstige', wert: 'a.alt@x.de' },
      ],
      weitereTelefone: [{ art: 'sonstige', wert: '+491711234567' }],
    });
  });
});

describe('Serienmail-Ausschlüsse', () => {
  it('überspringt, wer sich mit einer weiteren Adresse abgemeldet hat', () => {
    const [zeile] = ordneEmpfaenger(
      [
        {
          id: 'k1',
          email: 'anna@nordwind.de',
          firstName: 'Anna',
          lastName: 'A',
          unzustellbarSeit: null,
          weitereEmails: [{ wert: 'anna@privat.de' }],
        },
      ],
      new Set(['anna@privat.de']),
      new Set(),
    );

    expect(zeile.status).toBe('uebersprungen');
    expect(zeile.grund).toBe('Hat sich abgemeldet');
  });
});

class FakeReader implements MailReader {
  public eingang: IncomingMessage[] = [];

  check(): Promise<void> {
    return Promise.resolve();
  }

  read(): Promise<ReadResult> {
    return Promise.resolve({ uidValidity: 1, messages: this.eingang });
  }
}

let dataSource: DataSource;
let kontakte: ContactsService;
let postfach: MailboxesService;
let reader: FakeReader;
let permissions: PermissionsService;
let workspaceId: string;
let inhaber: RequestUser;
let ohneMail: RequestUser;
let nurLesen: RequestUser;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const nachricht = (uid: number, von: string, an = 'ich@wir.de') => ({
  uid,
  messageId: `m${String(uid)}@test`,
  from: von,
  to: an,
  cc: null,
  subject: 'Hallo',
  sentAt: new Date(),
  inReplyTo: null,
  references: null,
  text: 'Text',
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  reader = new FakeReader();
  postfach = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    { send: () => Promise.resolve() },
    { get: () => SCHLUESSEL } as unknown as ConfigService,
    dataSource.getRepository(MailSperreEntity),
    dataSource,
  );
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE mail_messages, mailboxes, contacts, companies, roles, memberships, workspaces, users CASCADE',
  );
  reader.eingang = [];

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Wir', slug: 'wir' })
  ).id;

  const users = dataSource.getRepository(UserEntity);
  const person = (email: string) =>
    users.save(
      users.create({ email, passwordHash: 'x', firstName: 'X', lastName: 'Y' }),
    );
  const [ich, aron, lea] = await Promise.all([
    person('ich@wir.de'),
    person('aron@wir.de'),
    person('lea@wir.de'),
  ]);
  const roles = dataSource.getRepository(RoleEntity);
  const rechte = [Permission.CONTACT_VIEW, Permission.CONTACT_WRITE];
  const [owner, verborgen, lesen] = await roles.save([
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
      name: 'Ohne Kontaktdaten',
      everything: false,
      permissions: rechte,
      feldrechte: {
        'contact.email': 'verborgen',
        'contact.phone': 'verborgen',
      },
      isSystem: false,
    }),
    roles.create({
      workspaceId,
      name: 'Nur lesen',
      everything: false,
      permissions: rechte,
      feldrechte: { 'contact.email': 'lesen', 'contact.phone': 'lesen' },
      isSystem: false,
    }),
  ]);

  await dataSource.getRepository(MembershipEntity).save([
    {
      userId: ich.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
    },
    {
      userId: aron.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: verborgen.id,
    },
    {
      userId: lea.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: lesen.id,
    },
  ]);

  inhaber = { userId: ich.id, workspaceId, email: ich.email };
  ohneMail = { userId: aron.id, workspaceId, email: aron.email };
  nurLesen = { userId: lea.id, workspaceId, email: lea.email };
});

const anna = () =>
  kontakte.create(workspaceId, {
    firstName: 'Anna',
    lastName: 'Alt',
    email: 'anna@nordwind.de',
    phone: '030 1234567',
    weitereEmails: [{ art: 'privat', wert: 'Anna.Alt@Privat.de' }],
    weitereTelefone: [{ art: 'mobil', wert: '0171 1234567' }],
  });

describe('Kontakt anlegen und ändern', () => {
  it('speichert Nummern in E.164 und Adressen klein', async () => {
    const k = await anna();

    expect(k.phone).toBe('+49301234567');
    expect(k.weitereEmails).toEqual([
      { art: 'privat', wert: 'anna.alt@privat.de' },
    ]);
    expect(k.weitereTelefone).toEqual([
      { art: 'mobil', wert: '+491711234567' },
    ]);

    const getauscht = await kontakte.update(workspaceId, k.id, {
      email: 'anna.alt@privat.de',
      weitereEmails: [{ art: 'arbeit', wert: 'anna@nordwind.de' }],
    });

    expect(getauscht.email).toBe('anna.alt@privat.de');
    expect(getauscht.weitereEmails).toEqual([
      { art: 'arbeit', wert: 'anna@nordwind.de' },
    ]);
  });

  it('findet den Kontakt in der Suche über die weitere Adresse', async () => {
    await anna();

    const seite = await kontakte.list(workspaceId, { search: 'privat.de' });

    expect(seite.items.map((k) => k.lastName)).toEqual(['Alt']);
  });
});

describe('Post über eine weitere Adresse', () => {
  it('ordnet beim Abruf und nachträglich zu, die Hauptadresse geht vor', async () => {
    const k = await anna();
    const bernd = await kontakte.create(workspaceId, {
      firstName: 'Bernd',
      lastName: 'B',
      email: 'gemeinsam@nordwind.de',
    });

    await dataSource.getRepository(MailMessageEntity).save({
      workspaceId,
      mailboxId: (
        await postfach.connect(workspaceId, inhaber.userId, {
          host: 'imap.example.de',
          port: 993,
          secure: true,
          username: 'ich@wir.de',
          password: 'geheim123456',
          folder: 'INBOX',
          gesendetOrdner: null,
        })
      ).id,
      messageId: 'alt@test',
      uid: 99,
      ordner: 'eingang',
      outgoing: false,
      fromAddress: 'anna.zweit@privat.de',
      fromName: null,
      toAddresses: 'ich@wir.de',
      subject: 'Alt',
      snippet: null,
      sentAt: new Date(),
      inReplyTo: null,
      references: null,
      threadKey: 'alt',
      contactId: null,
      companyId: null,
    });

    reader.eingang = [
      nachricht(1, 'Anna <anna.alt@privat.de>'),
      nachricht(2, 'gemeinsam@nordwind.de'),
    ];
    await kontakte.update(workspaceId, k.id, {
      weitereEmails: [
        { art: 'privat', wert: 'anna.alt@privat.de' },
        { art: 'arbeit', wert: 'gemeinsam@nordwind.de' },
      ],
    });
    await postfach.sync(workspaceId, inhaber.userId);

    const nachrichten = await dataSource
      .getRepository(MailMessageEntity)
      .find({ where: { workspaceId } });
    const von = (adresse: string) =>
      nachrichten.find((n) => n.fromAddress === adresse)?.contactId;

    expect(von('anna.alt@privat.de')).toBe(k.id);
    expect(von('gemeinsam@nordwind.de')).toBe(bernd.id);

    await kontakte.update(workspaceId, k.id, {
      weitereEmails: [
        { art: 'privat', wert: 'anna.alt@privat.de' },
        { art: 'sonstige', wert: 'anna.zweit@privat.de' },
      ],
    });
    await postfach.nachtraeglichZuordnen(workspaceId, { contactId: k.id });

    expect(
      (
        await dataSource
          .getRepository(MailMessageEntity)
          .findOneByOrFail({ messageId: 'alt@test' })
      ).contactId,
    ).toBe(k.id);
  });

  it('vermerkt einen Rückläufer an der weiteren Adresse, nicht am Kontakt', async () => {
    const k = await anna();

    await postfach.connect(workspaceId, inhaber.userId, {
      host: 'imap.example.de',
      port: 993,
      secure: true,
      username: 'ich@wir.de',
      password: 'geheim123456',
      folder: 'INBOX',
      gesendetOrdner: null,
    });
    reader.eingang = [
      {
        ...nachricht(3, 'MAILER-DAEMON@mx.wir.de'),
        subject: 'Undelivered Mail Returned to Sender',
        zustellbericht: [
          'Final-Recipient: rfc822; anna.alt@privat.de',
          'Action: failed',
          'Status: 5.1.1',
          'Diagnostic-Code: smtp; 550 User unknown',
        ].join('\r\n'),
      },
    ];
    await postfach.sync(workspaceId, inhaber.userId);

    const nachher = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: k.id });

    expect(nachher.unzustellbarSeit).toBeNull();
    expect(nachher.weitereEmails[0].unzustellbarSeit).toBeTruthy();
    expect(
      await postfach.unzustellbar(workspaceId, [
        'anna.alt@privat.de',
        'anna@nordwind.de',
      ]),
    ).toEqual(['anna.alt@privat.de']);

    await kontakte.update(workspaceId, k.id, { jobTitle: 'Einkauf' });
    expect(
      (
        await dataSource
          .getRepository(ContactEntity)
          .findOneByOrFail({ id: k.id })
      ).weitereEmails[0].unzustellbarSeit,
    ).toBeTruthy();

    reader.eingang = [nachricht(4, 'anna.alt@privat.de')];
    await postfach.sync(workspaceId, inhaber.userId);
    expect(
      await postfach.unzustellbar(workspaceId, ['anna.alt@privat.de']),
    ).toEqual([]);
  });
});

describe('Dubletten und Import', () => {
  it('warnt bei einer Adresse, die ein anderer als weitere führt, und führt zusammen', async () => {
    const k = await anna();
    const dubletten = new DublettenService(dataSource);

    const treffer = await dubletten.kontakte(
      workspaceId,
      '',
      '',
      'anna.alt@privat.de',
    );

    expect(treffer.map((t) => t.id)).toEqual([k.id]);

    const zweite = await kontakte.create(workspaceId, {
      firstName: 'Anna',
      lastName: 'Alt',
      email: 'a.alt@nordwind.de',
      phone: '+49 40 999999',
    });

    await dubletten.zusammenfuehren(
      workspaceId,
      'kontakt',
      k.id,
      zweite.id,
      null,
    );

    const bleibt = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: k.id });

    expect(bleibt.weitereEmails.map((e) => e.wert)).toEqual([
      'anna.alt@privat.de',
      'a.alt@nordwind.de',
    ]);
    expect(bleibt.weitereTelefone.map((t) => t.wert)).toContain('+4940999999');
  });

  it('importiert Zweitadressen, normalisiert Nummern und trifft über die weitere Adresse', async () => {
    const k = await anna();
    const importe = new ImportService(
      dataSource,
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    );
    const bericht = await importe.run(workspaceId, {
      entity: ImportEntity.CONTACT,
      csv: [
        'Vorname;Nachname;E-Mail;Telefon;E-Mail privat;Mobil',
        'Anna;Alt;anna.alt@privat.de;;;0160 9999999',
        'Carl;C;carl@x.de;040 123456;carl@privat.de, carl@web.de;0170 1111111',
      ].join('\n'),
      mapping: [
        { column: 'Vorname', field: 'firstName' },
        { column: 'Nachname', field: 'lastName' },
        { column: 'E-Mail', field: 'email' },
        { column: 'Telefon', field: 'phone' },
        { column: 'E-Mail privat', field: 'emailPrivat' },
        { column: 'Mobil', field: 'telefonMobil' },
      ],
      dryRun: false,
    });

    expect(bericht.rejections).toEqual([]);
    expect(bericht.updated).toBe(1);
    expect(bericht.created).toBe(1);

    const alle = await dataSource
      .getRepository(ContactEntity)
      .find({ where: { workspaceId }, order: { firstName: 'ASC' } });
    const [annaNeu, carl] = alle;

    expect(annaNeu.id).toBe(k.id);
    expect(annaNeu.email).toBe('anna@nordwind.de');
    expect(annaNeu.weitereTelefone.map((t) => t.wert)).toEqual([
      '+491711234567',
      '+491609999999',
    ]);
    expect(carl.phone).toBe('+4940123456');
    expect(carl.weitereEmails).toEqual([
      { art: 'privat', wert: 'carl@privat.de' },
      { art: 'privat', wert: 'carl@web.de' },
    ]);
  });

  it('lehnt beim Import Nummern ohne Ziffer ab, Durchwahlen nicht', async () => {
    const importe = new ImportService(
      dataSource,
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    );
    const bericht = await importe.run(workspaceId, {
      entity: ImportEntity.CONTACT,
      csv: [
        'Vorname;Nachname;Telefon;Mobil',
        'Dora;D;siehe Zentrale;',
        'Emil;E;;keine',
        'Fritz;F;-23;+49 (0)89 123456',
      ].join('\n'),
      mapping: [
        { column: 'Vorname', field: 'firstName' },
        { column: 'Nachname', field: 'lastName' },
        { column: 'Telefon', field: 'phone' },
        { column: 'Mobil', field: 'telefonMobil' },
      ],
      dryRun: false,
    });

    expect(bericht.created).toBe(1);
    expect(
      bericht.rejections.map(({ row, reason }) => ({ row, reason })),
    ).toEqual([
      { row: 2, reason: 'Eine Telefonnummer braucht mindestens eine Ziffer.' },
      { row: 3, reason: 'Eine Telefonnummer braucht mindestens eine Ziffer.' },
    ]);
  });
});

describe('Feldrechte', () => {
  it('verbirgt weitere Adressen und Nummern mit dem Hauptfeld', async () => {
    const middleware = verbirgListe('contact.email');
    const liste = [{ art: 'privat', wert: 'a@b.de' }];
    const ausgeliefert = () =>
      Promise.resolve(
        middleware({} as never, () => Promise.resolve(liste)),
      ) as Promise<unknown>;

    expect(await als(ohneMail, ausgeliefert)).toEqual([]);
    expect(await als(inhaber, ausgeliefert)).toEqual(liste);

    const k = await anna();
    const seite = await als(ohneMail, () =>
      kontakte.list(workspaceId, { search: 'privat.de' }),
    );

    expect(seite.items).toEqual([]);
    expect(
      (
        await als(ohneMail, () =>
          new ExportService(
            {} as CompaniesService,
            kontakte,
            {} as DealsService,
            new CustomFieldsService(
              dataSource.getRepository(CustomFieldDefinition),
            ),
          ).csv(workspaceId, 'CONTACT'),
        )
      ).split('\n')[0],
    ).not.toContain('Weitere');

    const protokoll = new AuditResolver({} as never, {} as never, permissions);
    const eintrag = {
      entityType: 'Contact',
      changes: {
        email: ['a@x.de', 'b@x.de'],
        weitereEmails: [[], [{ art: 'privat', wert: 'c@x.de' }]],
        jobTitle: ['A', 'B'],
      },
    } as unknown as AuditLogEntity;

    expect(
      JSON.parse(
        (await als(ohneMail, () => protokoll.changes(ohneMail, eintrag))) ?? '',
      ),
    ).toEqual({ jobTitle: ['A', 'B'] });
    expect(
      Object.keys(
        JSON.parse(
          (await als(inhaber, () => protokoll.changes(inhaber, eintrag))) ?? '',
        ),
      ),
    ).toEqual(['email', 'weitereEmails', 'jobTitle']);

    await expect(
      als(nurLesen, () =>
        kontakte.update(workspaceId, k.id, {
          weitereTelefone: [{ art: 'mobil', wert: '0170 1' }],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(nurLesen, () =>
        kontakte.update(workspaceId, k.id, { jobTitle: 'Chefin' }),
      ),
    ).resolves.toBeDefined();
  });
});
