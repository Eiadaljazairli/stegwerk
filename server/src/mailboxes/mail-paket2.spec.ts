import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { ContactsService } from '../crm/contacts.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { runWithRequestContext } from '../observability/request-context';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  berichtsTeil,
  type IncomingMessage,
  type MailboxCredentials,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from './imap-reader';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService } from './mailboxes.service';
import { type MailSender } from './smtp-sender';
import { zustellfehler } from './zustellfehler';

const SUITE = 'mail_paket2';

jest.setTimeout(60_000);

const BERICHT = [
  'Reporting-MTA: dns; mx.wir.de',
  '',
  'Final-Recipient: rfc822; alt@nordwind.de',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
  '',
  'Final-Recipient: rfc822; spaeter@nordwind.de',
  'Action: delayed',
  'Status: 4.4.1',
].join('\r\n');

describe('Rückläufer erkennen', () => {
  it('liest den Zustellbericht und nimmt nur, was endgültig scheiterte', () => {
    expect(
      zustellfehler(
        {
          from: 'Mail Delivery System <MAILER-DAEMON@mx.wir.de>',
          subject: 'Undelivered Mail Returned to Sender',
          text: 'This is the mail system.',
          zustellbericht: BERICHT,
        },
        'ich@wir.de',
      ),
    ).toEqual({
      adressen: ['alt@nordwind.de'],
      grund: '550 5.1.1 User unknown',
    });
  });

  it('nimmt ohne Bericht nur die eine fremde Adresse aus dem Text eines Mailservers', () => {
    expect(
      zustellfehler(
        {
          from: 'postmaster@mx.wir.de',
          subject: 'Unzustellbar: Angebot',
          text: 'Die Nachricht an <alt@nordwind.de> konnte nicht zugestellt werden.',
        },
        'ich@wir.de',
      )?.adressen,
    ).toEqual(['alt@nordwind.de']);
  });

  it('hält eine gewöhnliche Nachricht und eine unklare Meldung nicht für Rückläufer', () => {
    expect(
      zustellfehler(
        {
          from: 'anna@nordwind.de',
          subject: 'Undelivered? Nein, nur ein Witz',
          text: 'x@y.de',
        },
        'ich@wir.de',
      ),
    ).toBeNull();
    expect(
      zustellfehler(
        {
          from: 'mailer-daemon@mx.wir.de',
          subject: 'Mail delivery failed',
          text: 'Weder a@b.de noch c@d.de kamen an.',
        },
        'ich@wir.de',
      ),
    ).toBeNull();
  });

  it('findet den Teil des Berichts in der Struktur', () => {
    expect(
      berichtsTeil({
        type: 'multipart/report',
        childNodes: [
          { part: '1', type: 'text/plain' },
          { part: '2', type: 'message/delivery-status' },
          { part: '3', type: 'message/rfc822' },
        ],
      }),
    ).toBe('2');
    expect(berichtsTeil({ type: 'multipart/mixed', childNodes: [] })).toBe(
      null,
    );
  });
});

const KEY = randomBytes(32).toString('base64');

class FakeReader implements MailReader {
  public ordner: Record<string, IncomingMessage[]> = {};
  public geprueft: string[] = [];

  check(credentials: MailboxCredentials): Promise<void> {
    this.geprueft.push(credentials.folder);

    return Promise.resolve();
  }

  read(
    credentials: MailboxCredentials,
    options: ReadOptions,
  ): Promise<ReadResult> {
    return Promise.resolve({
      uidValidity: 7,
      messages: (this.ordner[credentials.folder] ?? []).filter(
        (m) => m.uid > options.afterUid,
      ),
    });
  }
}

const KEIN_VERSAND: MailSender = { send: () => Promise.resolve() };

let dataSource: DataSource;
let service: MailboxesService;
let contacts: ContactsService;
let reader: FakeReader;
let workspaceId: string;
let ichId: string;
let kollegeId: string;

const nachricht = (
  uid: number,
  von: string,
  messageId: string,
  an = 'ich@wir.de',
): IncomingMessage => ({
  uid,
  messageId,
  from: von,
  to: an,
  cc: null,
  subject: 'Hallo',
  sentAt: new Date(),
  inReplyTo: null,
  references: null,
  text: 'Vertraulicher Text',
});

const verbinden = (
  userId: string,
  adresse: string,
  gesendetOrdner: string | null = null,
) =>
  service.connect(workspaceId, userId, {
    host: 'imap.example.de',
    port: 993,
    secure: true,
    username: adresse,
    password: 'geheim123456',
    folder: 'INBOX',
    gesendetOrdner,
  });

const nutzer = async (email: string) =>
  (
    await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email,
        passwordHash: 'x',
        firstName: 'Test',
        lastName: 'Person',
      }),
    )
  ).id;

const kontakt = (email: string | null, companyId: string | null = null) =>
  dataSource.getRepository(ContactEntity).save(
    dataSource.getRepository(ContactEntity).create({
      workspaceId,
      firstName: 'Anna',
      lastName: 'Alt',
      email,
      companyId,
    }),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  reader = new FakeReader();
  service = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    KEIN_VERSAND,
    { get: () => KEY } as unknown as ConfigService,
    dataSource.getRepository(MailSperreEntity),
    dataSource,
  );
  service.onModuleInit();
  contacts = new ContactsService(
    dataSource.getRepository(ContactEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );
});

afterAll(async () => {
  service.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE mail_messages, mailboxes, contacts, companies, workspaces, users CASCADE',
  );
  reader.ordner = {};
  reader.geprueft = [];

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save(
        dataSource
          .getRepository(WorkspaceEntity)
          .create({ name: 'Wir', slug: 'wir' }),
      )
  ).id;
  ichId = await nutzer('ich@wir.de');
  kollegeId = await nutzer('kollege@wir.de');
});

describe('Sichtbarkeit der Post von Kollegen', () => {
  const vorbereiten = async (sichtbarkeit: 'alles' | 'kopf' | 'privat') => {
    const anna = await kontakt('anna@nordwind.de');

    await verbinden(kollegeId, 'kollege@wir.de');
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de', 'kollege@wir.de'),
    ];
    await service.sync(workspaceId, kollegeId);
    await service.sichtbarkeitSetzen(workspaceId, kollegeId, sichtbarkeit);

    return anna.id;
  };

  it('zeigt bei „alles“ allen den Text', async () => {
    const annaId = await vorbereiten('alles');
    const [gesehen] = await service.forContact(workspaceId, annaId, ichId);

    expect(gesehen.snippet).toContain('Vertraulich');
    expect(gesehen.inhaltVerborgen).toBe(false);
  });

  it('zeigt bei „kopf“ den anderen nur Betreff und Beteiligte', async () => {
    const annaId = await vorbereiten('kopf');
    const [fremd] = await service.forContact(workspaceId, annaId, ichId);
    const [eigen] = await service.forContact(workspaceId, annaId, kollegeId);

    expect(fremd.subject).toBe('Hallo');
    expect(fremd.fromAddress).toBe('anna@nordwind.de');
    expect(fremd.snippet).toBeNull();
    expect(fremd.inhaltVerborgen).toBe(true);
    expect(eigen.snippet).toContain('Vertraulich');
  });

  it('findet in der Suche den Text nur, wo er sichtbar ist', async () => {
    await vorbereiten('kopf');

    expect(await service.suche(workspaceId, ichId, 'Vertraulich')).toEqual([]);
    expect(
      await service.suche(workspaceId, kollegeId, 'Vertraulich'),
    ).toHaveLength(1);

    const [perBetreff] = await service.suche(workspaceId, ichId, 'hallo');
    expect(perBetreff.snippet).toBeNull();

    await service.sichtbarkeitSetzen(workspaceId, kollegeId, 'privat');
    expect(await service.suche(workspaceId, ichId, 'hallo')).toEqual([]);
  });

  it('zeigt bei „privat“ niemandem sonst etwas, auch nicht am Geschäft', async () => {
    const annaId = await vorbereiten('privat');

    expect(await service.forContact(workspaceId, annaId, ichId)).toEqual([]);
    expect(
      await service.forContact(workspaceId, annaId, kollegeId),
    ).toHaveLength(1);
  });

  it('zeigt Post an fremden Kunden nicht, wer nur die eigenen sieht', async () => {
    const annaId = await vorbereiten('alles');

    await dataSource
      .getRepository(ContactEntity)
      .update(annaId, { ownerId: kollegeId });

    const alsIch = <T>(tun: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ requestId: 'test' }, () => {
        setzeSichtfeld(() =>
          Promise.resolve({
            ich: ichId,
            arten: { company: 'alle', contact: 'eigene', deal: 'alle' },
            felder: {},
          }),
        );

        return tun();
      });

    expect(
      await alsIch(() => service.forContact(workspaceId, annaId, ichId)),
    ).toEqual([]);
    expect(
      await alsIch(() => service.suche(workspaceId, ichId, 'hallo')),
    ).toEqual([]);

    expect(await service.forContact(workspaceId, annaId, ichId)).toHaveLength(
      1,
    );
  });

  it('lässt nicht auf eine private Nachricht antworten', async () => {
    const annaId = await vorbereiten('privat');
    const [privat] = await service.forContact(workspaceId, annaId, kollegeId);

    await verbinden(ichId, 'ich@wir.de');
    await dataSource
      .getRepository(MailboxEntity)
      .update({ userId: ichId }, { smtpHost: 'smtp.wir.de', smtpPort: 587 });

    await expect(
      service.senden(workspaceId, ichId, {
        an: ['anna@nordwind.de'],
        betreff: 'Re: Hallo',
        rumpf: 'x',
        antwortAuf: privat.id,
      }),
    ).rejects.toThrow('gibt es nicht');
  });
});

describe('das Postfach trennen', () => {
  it('behält die Post auf Wunsch, vergisst aber das Passwort', async () => {
    const anna = await kontakt('anna@nordwind.de');

    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [nachricht(1, 'anna@nordwind.de', 'b1@nordwind.de')];
    await service.sync(workspaceId, ichId);

    await service.disconnect(workspaceId, ichId, true);

    const zeile = await dataSource
      .getRepository(MailboxEntity)
      .findOneByOrFail({ userId: ichId });

    expect(zeile.passwordSealed).toBe('');
    expect(zeile.active).toBe(false);
    expect(await service.verbunden(workspaceId, ichId)).toBeNull();
    expect(await service.forContact(workspaceId, anna.id, ichId)).toHaveLength(
      1,
    );
    await expect(service.sync(workspaceId, ichId)).rejects.toThrow(
      'kein Postfach',
    );

    reader.ordner.INBOX.push(
      nachricht(2, 'anna@nordwind.de', 'b2@nordwind.de'),
    );
    await verbinden(ichId, 'ich@wir.de');
    const lauf = await service.sync(workspaceId, ichId);

    expect(lauf.stored).toBe(1);
  });

  it('nimmt die Post ohne den Wunsch mit', async () => {
    await kontakt('anna@nordwind.de');
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [nachricht(1, 'anna@nordwind.de', 'c1@nordwind.de')];
    await service.sync(workspaceId, ichId);

    await service.disconnect(workspaceId, ichId);

    expect(await dataSource.getRepository(MailMessageEntity).count()).toBe(0);
  });
});

describe('alte Post nachträglich zuordnen', () => {
  it('hängt Post an einen neuen Kontakt, sobald er angelegt ist', async () => {
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [
      nachricht(1, 'Neu Kunde <neu@kunde.de>', 'd1@kunde.de'),
      nachricht(2, 'ich@wir.de', 'd2@wir.de', 'Neu <neu@kunde.de>'),
      nachricht(3, 'xneu@kunde.de', 'd3@kunde.de'),
    ];
    await service.sync(workspaceId, ichId);

    const neu = await contacts.create(workspaceId, {
      firstName: 'Neu',
      lastName: 'Kunde',
      email: 'Neu@Kunde.de',
    });
    await service.warteAufZuordnungen();

    const zugeordnet = await service.forContact(workspaceId, neu.id, ichId);

    expect(zugeordnet.map((m) => m.messageId).sort()).toEqual([
      'd1@kunde.de',
      'd2@wir.de',
    ]);
  });

  it('ordnet zu, wenn ein Kontakt später eine Adresse bekommt, und hebt die Unzustellbar-Markierung auf', async () => {
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [nachricht(1, 'spaet@kunde.de', 'e1@kunde.de')];
    await service.sync(workspaceId, ichId);

    const ohne = await kontakt(null);

    await dataSource
      .getRepository(ContactEntity)
      .update(ohne.id, { unzustellbarSeit: new Date() });
    await contacts.update(workspaceId, ohne.id, { email: 'spaet@kunde.de' });
    await service.warteAufZuordnungen();

    expect(await service.forContact(workspaceId, ohne.id, ichId)).toHaveLength(
      1,
    );
    expect(
      (
        await dataSource
          .getRepository(ContactEntity)
          .findOneByOrFail({ id: ohne.id })
      ).unzustellbarSeit,
    ).toBeNull();
  });

  it('ordnet beim Abruf auch Firmen über die Domain zu, nur ohne Kontakt', async () => {
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [nachricht(1, 'wer@firma.de', 'f1@firma.de')];
    await service.sync(workspaceId, ichId);

    const firma = await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId, name: 'Firma', domain: 'firma.de' }),
      );

    reader.ordner.INBOX.push(nachricht(2, 'x@anders.de', 'f2@anders.de'));
    await service.sync(workspaceId, ichId);

    expect(
      (await service.forCompany(workspaceId, firma.id, ichId)).map(
        (m) => m.messageId,
      ),
    ).toEqual(['f1@firma.de']);
  });
});

describe('der Gesendet-Ordner', () => {
  it('liest ihn mit eigener Nummerierung neben dem Posteingang', async () => {
    const anna = await kontakt('anna@nordwind.de');

    await verbinden(ichId, 'ich@wir.de', 'Gesendete Elemente');
    expect(reader.geprueft).toContain('Gesendete Elemente');

    reader.ordner.INBOX = [nachricht(5, 'anna@nordwind.de', 'g1@nordwind.de')];
    reader.ordner['Gesendete Elemente'] = [
      nachricht(1, 'ich@wir.de', 'g2@wir.de', 'anna@nordwind.de'),
    ];
    await service.sync(workspaceId, ichId);

    reader.ordner['Gesendete Elemente'].push(
      nachricht(2, 'ich@wir.de', 'g3@wir.de', 'anna@nordwind.de'),
    );
    await service.sync(workspaceId, ichId);

    const alle = await service.forContact(workspaceId, anna.id, ichId);

    expect(alle.map((m) => m.messageId).sort()).toEqual([
      'g1@nordwind.de',
      'g2@wir.de',
      'g3@wir.de',
    ]);
    expect(alle.find((m) => m.messageId === 'g3@wir.de')?.outgoing).toBe(true);
  });
});

describe('Rückläufer im Postfach', () => {
  it('markiert den Kontakt, warnt vorm Senden und hebt es bei neuer Post auf', async () => {
    const alt = await kontakt('alt@nordwind.de');

    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [
      {
        ...nachricht(1, 'MAILER-DAEMON@mx.wir.de', 'h1@mx.wir.de'),
        subject: 'Undelivered Mail Returned to Sender',
        zustellbericht: BERICHT,
      },
    ];
    await service.sync(workspaceId, ichId);

    const markiert = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: alt.id });

    expect(markiert.unzustellbarSeit).not.toBeNull();
    expect(markiert.unzustellbarGrund).toBe('550 5.1.1 User unknown');
    expect(
      await service.unzustellbar(workspaceId, [
        'Alt <ALT@nordwind.de>',
        'anders@nordwind.de',
      ]),
    ).toEqual(['alt@nordwind.de']);

    reader.ordner.INBOX.push(nachricht(2, 'alt@nordwind.de', 'h2@nordwind.de'));
    await service.sync(workspaceId, ichId);

    expect(
      (
        await dataSource
          .getRepository(ContactEntity)
          .findOneByOrFail({ id: alt.id })
      ).unzustellbarSeit,
    ).toBeNull();
  });
});

describe('Vorschläge für neue Kontakte', () => {
  it('nennt unbekannte Menschen, keine Maschinen und nicht die eigene Domain', async () => {
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [
      nachricht(1, '"Berger, Petra" <p.berger@neukunde.de>', 'v1@neukunde.de'),
      nachricht(2, 'no-reply@shop.de', 'v2@shop.de'),
      nachricht(3, 'kollegin@wir.de', 'v3@wir.de'),
      nachricht(4, 'max.mustermann@gmail.com', 'v4@gmail.com'),
    ];
    await service.sync(workspaceId, ichId);

    const vorschlaege = await service.kontaktVorschlaege(workspaceId, ichId);

    expect(vorschlaege.map((v) => v.adresse).sort()).toEqual([
      'max.mustermann@gmail.com',
      'p.berger@neukunde.de',
    ]);
    expect(
      vorschlaege.find((v) => v.adresse === 'p.berger@neukunde.de'),
    ).toMatchObject({
      vorname: 'Petra',
      nachname: 'Berger',
      firmaVorschlag: 'Neukunde',
      domain: 'neukunde.de',
    });
    expect(
      vorschlaege.find((v) => v.adresse === 'max.mustermann@gmail.com'),
    ).toMatchObject({
      vorname: 'Max',
      nachname: 'Mustermann',
      firmaVorschlag: null,
      domain: null,
    });
  });
});
