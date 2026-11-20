import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  type IncomingMessage,
  type MailboxCredentials,
  MailboxUnreachableError,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from './imap-reader';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService } from './mailboxes.service';
import {
  type MailSender,
  VersandFehlgeschlagen,
  type Versandauftrag,
  type Versandzugang,
} from './smtp-sender';
import { open, readKey } from './secret-box';

const BETRACHTER = '00000000-0000-4000-8000-000000000000';

const SUITE = 'mailboxes';

jest.setTimeout(60_000);

let dataSource: DataSource;
let sender: FakeSender;
let service: MailboxesService;
let reader: FakeReader;
let workspaceId: string;
let otherWorkspaceId: string;
let userId: string;
let annaId: string;
let nordwindId: string;

const KEY = randomBytes(32).toString('base64');

class FakeReader implements MailReader {
  public result: ReadResult = { uidValidity: 7, messages: [] };
  public failCheck: Error | null = null;
  public failRead: Error | null = null;
  public lastCredentials: MailboxCredentials | null = null;
  public lastOptions: ReadOptions | null = null;
  public reads = 0;

  async check(credentials: MailboxCredentials): Promise<void> {
    this.lastCredentials = credentials;

    if (this.failCheck !== null) {
      throw this.failCheck;
    }

    return Promise.resolve();
  }

  async read(
    credentials: MailboxCredentials,
    options: ReadOptions,
  ): Promise<ReadResult> {
    this.lastCredentials = credentials;
    this.lastOptions = options;
    this.reads += 1;

    if (this.failRead !== null) {
      throw this.failRead;
    }

    return Promise.resolve({
      uidValidity: this.result.uidValidity,
      messages: this.result.messages.filter(
        (entry) => entry.uid > options.afterUid,
      ),
    });
  }
}

class FakeSender implements MailSender {
  aufträge: { zugang: Versandzugang; auftrag: Versandauftrag }[] = [];

  fehler: Error | null = null;

  send(zugang: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    if (this.fehler !== null) {
      const gleich = this.fehler;
      this.fehler = null;

      return Promise.reject(gleich);
    }

    this.aufträge.push({ zugang, auftrag });

    return Promise.resolve();
  }

  get letzter(): Versandauftrag {
    const letzter = this.aufträge.at(-1);

    if (letzter === undefined) {
      throw new Error('Es wurde nichts verschickt.');
    }

    return letzter.auftrag;
  }
}

const message = (
  overrides: Partial<IncomingMessage> & { uid: number; messageId: string },
): IncomingMessage => ({
  from: 'Anna Schmidt <anna@nordwind.de>',
  to: 'ich@wir.de',
  cc: null,
  subject: 'Anfrage Lagersystem',
  sentAt: new Date('2026-03-12T09:14:00Z'),
  inReplyTo: null,
  references: null,
  text: 'Guten Tag, bitte senden Sie uns ein Angebot.',
  ...overrides,
});

const connect = () =>
  service.connect(workspaceId, userId, {
    host: 'imap.example.de',
    port: 993,
    secure: true,
    username: 'ich@wir.de',
    password: 'geheim123456',
    folder: 'INBOX',
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  reader = new FakeReader();
  sender = new FakeSender();
  service = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    sender,
    { get: () => KEY } as unknown as ConfigService,
    dataSource.getRepository(MailSperreEntity),
    dataSource,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE mail_messages, mailboxes, contacts, companies, workspaces, users CASCADE',
  );

  reader.result = { uidValidity: 7, messages: [] };
  reader.failCheck = null;
  reader.failRead = null;
  reader.reads = 0;

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const companies = dataSource.getRepository(CompanyEntity);
  const contacts = dataSource.getRepository(ContactEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;
  userId = (
    await users.save(
      users.create({
        email: 'ich@wir.de',
        passwordHash: 'x',
        firstName: 'Ich',
        lastName: 'Selbst',
      }),
    )
  ).id;

  nordwindId = (
    await companies.save(
      companies.create({
        workspaceId,
        name: 'Nordwind Logistik GmbH',
        domain: 'nordwind.de',
      }),
    )
  ).id;

  annaId = (
    await contacts.save(
      contacts.create({
        workspaceId,
        firstName: 'Anna',
        lastName: 'Schmidt',
        email: 'anna@nordwind.de',
        companyId: nordwindId,
      }),
    )
  ).id;
});

describe('ein Postfach verbinden', () => {
  it('speichert es und gibt es zurück', async () => {
    const mailbox = await connect();

    expect(mailbox.host).toBe('imap.example.de');
    expect(mailbox.username).toBe('ich@wir.de');
    expect(mailbox.active).toBe(true);
  });

  it('legt das Passwort nicht im Klartext ab', async () => {
    const mailbox = await connect();

    expect(mailbox.passwordSealed).not.toContain('geheim123456');
    expect(open(mailbox.passwordSealed, readKey(KEY))).toBe('geheim123456');
  });

  it('probiert die Zugangsdaten, bevor es sie speichert', async () => {
    reader.failCheck = new MailboxUnreachableError('Anmeldung fehlgeschlagen.');

    await expect(connect()).rejects.toThrow('Anmeldung fehlgeschlagen.');
    expect(await service.find(workspaceId, userId)).toBeNull();
  });

  it('ersetzt ein vorhandenes Postfach, statt ein zweites anzulegen', async () => {
    await connect();
    await service.connect(workspaceId, userId, {
      host: 'imap.anders.de',
      port: 143,
      secure: false,
      username: 'ich@wir.de',
      password: 'neu1234567890',
      folder: 'INBOX',
    });

    const mailbox = await service.find(workspaceId, userId);

    expect(mailbox?.host).toBe('imap.anders.de');
    expect(await dataSource.getRepository(MailboxEntity).count()).toBe(1);
  });

  it('verweigert das Speichern ohne Schlüssel', async () => {
    const ohneSchluessel = new MailboxesService(
      dataSource.getRepository(MailboxEntity),
      dataSource.getRepository(MailMessageEntity),
      dataSource.getRepository(ContactEntity),
      dataSource.getRepository(CompanyEntity),
      reader,
      sender,
      { get: () => undefined } as unknown as ConfigService,
      dataSource.getRepository(MailSperreEntity),
      dataSource,
    );

    await expect(
      ohneSchluessel.connect(workspaceId, userId, {
        host: 'imap.example.de',
        port: 993,
        secure: true,
        username: 'ich@wir.de',
        password: 'geheim123456',
        folder: 'INBOX',
      }),
    ).rejects.toThrow(/MAIL_ENCRYPTION_KEY/u);
  });
});

describe('lesen und zuordnen', () => {
  it('legt eine Nachricht beim passenden Kontakt ab', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 12, messageId: '<a@nordwind.de>' })],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result).toEqual({ stored: 1, matched: 1, unfiled: 0 });

    const stored = await service.forContact(workspaceId, annaId, BETRACHTER);

    expect(stored).toHaveLength(1);
    expect(stored[0].subject).toBe('Anfrage Lagersystem');
    expect(stored[0].companyId).toBe(nordwindId);
    expect(stored[0].fromName).toBe('Anna Schmidt');
  });

  it('legt eine unbekannte Adresse auf die Firma, wenn die Domain passt', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 13,
          messageId: '<b@nordwind.de>',
          from: 'neu@nordwind.de',
        }),
      ],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result.matched).toBe(1);
    expect(
      await service.forCompany(workspaceId, nordwindId, BETRACHTER),
    ).toHaveLength(1);
  });

  it('legt Post von einer weiteren Domain auf die Firma', async () => {
    await dataSource
      .getRepository(CompanyEntity)
      .update(nordwindId, { zweitdomains: ['nordwind-logistik.de'] });
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 14,
          messageId: '<c@nordwind-logistik.de>',
          from: 'alt@nordwind-logistik.de',
        }),
      ],
    };

    try {
      const result = await service.sync(workspaceId, userId);

      expect(result.matched).toBe(1);
      expect(
        await service.forCompany(workspaceId, nordwindId, BETRACHTER),
      ).toHaveLength(1);
    } finally {
      await dataSource
        .getRepository(CompanyEntity)
        .update(nordwindId, { zweitdomains: [] });
    }
  });

  it('ordnet keiner Firma zu, die bei einem Freimailer sitzt', async () => {
    const companies = dataSource.getRepository(CompanyEntity);
    await companies.save(
      companies.create({ workspaceId, name: 'Falsch', domain: 'gmail.com' }),
    );

    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 17,
          messageId: '<m@gmail.com>',
          from: 'irgendwer@gmail.com',
          to: 'ich@wir.de',
        }),
      ],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result.matched).toBe(0);
  });

  it('behält eine Nachricht, die zu nichts passt', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 14, messageId: '<c@fremd.de>', from: 'wer@fremd.de' }),
      ],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result).toEqual({ stored: 1, matched: 0, unfiled: 1 });
  });

  it('erkennt, was der Postfachbesitzer selbst geschrieben hat', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 15,
          messageId: '<d@wir.de>',
          from: 'ich@wir.de',
          to: 'anna@nordwind.de',
        }),
      ],
    };

    await service.sync(workspaceId, userId);
    const stored = await service.forContact(workspaceId, annaId, BETRACHTER);

    expect(stored[0].outgoing).toBe(true);
  });

  it('legt Newsletter und Benachrichtigungen nicht ab, auch nicht an der Firma', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 21,
          messageId: '<news@nordwind.de>',
          from: 'Nordwind News <news@nordwind.de>',
          massenpost: true,
        }),
        message({ uid: 22, messageId: '<echt@nordwind.de>' }),
      ],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result.stored).toBe(1);
    expect(
      (await service.forCompany(workspaceId, nordwindId, BETRACHTER)).map(
        (n) => n.messageId,
      ),
    ).toEqual(['echt@nordwind.de']);

    reader.result = { uidValidity: 7, messages: [] };
    await service.sync(workspaceId, userId);
    expect(reader.lastOptions?.afterUid).toBe(22);
  });

  it('legt Kollegenpost, Einladungen und Abmeldungen nicht ab', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 31,
          messageId: '<intern@wir.de>',
          from: 'Kollege <kollege@wir.de>',
          to: 'ich@wir.de',
        }),
        message({
          uid: 32,
          messageId: '<einladung@nordwind.de>',
          kalender: 'BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR',
        }),
        message({
          uid: 33,
          messageId: '<ab@wir.de>',
          from: 'ich@wir.de',
          to: 'unsubscribe@liste.nordwind.de',
        }),
        message({
          uid: 34,
          messageId: '<kopie@wir.de>',
          from: 'kollege@wir.de',
          to: 'ich@wir.de',
          cc: 'anna@nordwind.de',
        }),
      ],
    };

    const result = await service.sync(workspaceId, userId);

    expect(result.stored).toBe(1);
    expect(
      (await service.forContact(workspaceId, annaId, BETRACHTER)).map(
        (n) => n.messageId,
      ),
    ).toEqual(['kopie@wir.de']);
  });

  it('kürzt den Text auf zwei lesbare Zeilen', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 16,
          messageId: '<e@nordwind.de>',
          text: 'Ja, passt.\n\n> Guten Tag,\n> hier ist unser Angebot.',
        }),
      ],
    };

    await service.sync(workspaceId, userId);
    const stored = await service.forContact(workspaceId, annaId, BETRACHTER);

    expect(stored[0].snippet).toBe('Ja, passt.');
  });
});

describe('zweimal lesen', () => {
  it('speichert dieselbe Nachricht kein zweites Mal', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 20, messageId: '<f@nordwind.de>' })],
    };

    await service.sync(workspaceId, userId);
    const zweiter = await service.sync(workspaceId, userId);

    expect(zweiter.stored).toBe(0);
    expect(
      await service.forContact(workspaceId, annaId, BETRACHTER),
    ).toHaveLength(1);
  });

  it('liest beim nächsten Mal erst ab der höchsten gespeicherten Nummer', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 20, messageId: '<g@nordwind.de>' }),
        message({ uid: 34, messageId: '<h@nordwind.de>' }),
      ],
    };

    await service.sync(workspaceId, userId);
    await service.sync(workspaceId, userId);

    expect(reader.lastOptions?.afterUid).toBe(34);
  });

  it('fängt von vorn an, wenn der Server neu nummeriert hat', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 90, messageId: '<i@nordwind.de>' })],
    };
    await service.sync(workspaceId, userId);

    reader.result = {
      uidValidity: 99,
      messages: [message({ uid: 3, messageId: '<j@nordwind.de>' })],
    };
    const nach = await service.sync(workspaceId, userId);

    expect(nach.stored).toBe(1);
  });
});

describe('wenn etwas schiefgeht', () => {
  it('schreibt den Grund an das Postfach', async () => {
    await connect();
    reader.failRead = new MailboxUnreachableError(
      'Anmeldung fehlgeschlagen. Benutzername oder Passwort stimmen nicht.',
    );

    await expect(service.sync(workspaceId, userId)).rejects.toThrow(
      BadRequestException,
    );

    const mailbox = await service.find(workspaceId, userId);

    expect(mailbox?.lastError).toMatch(/Anmeldung fehlgeschlagen/u);
    expect(mailbox?.lastSyncedAt).not.toBeNull();
  });

  it('löscht den Grund, sobald es wieder geht', async () => {
    await connect();
    reader.failRead = new MailboxUnreachableError('Kaputt.');
    await expect(service.sync(workspaceId, userId)).rejects.toThrow();

    reader.failRead = null;
    await service.sync(workspaceId, userId);

    expect((await service.find(workspaceId, userId))?.lastError).toBeNull();
  });

  it('sagt es, wenn gar kein Postfach verbunden ist', async () => {
    await expect(service.sync(workspaceId, userId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('zählt Fehlversuche mit ihrer Art und setzt sie beim Erfolg zurück', async () => {
    await connect();
    reader.failRead = new MailboxUnreachableError(
      'Keine Verbindung zum Server. Bitte Port und Verschlüsselung prüfen.',
    );
    await expect(service.sync(workspaceId, userId)).rejects.toThrow();
    await expect(service.sync(workspaceId, userId)).rejects.toThrow();

    const gestoert = await service.find(workspaceId, userId);

    expect(gestoert?.fehlerArt).toBe('voruebergehend');
    expect(gestoert?.fehlversuche).toBe(2);
    expect(gestoert?.fehlerSeit).not.toBeNull();

    reader.failRead = null;
    await service.sync(workspaceId, userId);

    const wieder = await service.find(workspaceId, userId);

    expect([
      wieder?.fehlerArt,
      wieder?.fehlversuche,
      wieder?.fehlerSeit,
    ]).toEqual([null, 0, null]);
  });

  it('gibt den Schalter für Gmail-Kategorien an den Leser und zählt Ausgelassenes zur Marke', async () => {
    await connect();

    const lesen = reader.read.bind(reader);

    reader.read = async (credentials, options) => ({
      ...(await lesen(credentials, options)),
      hoechsteUid: 40,
    });

    try {
      await service.sync(workspaceId, userId);
    } finally {
      reader.read = lesen;
    }

    expect(reader.lastCredentials?.ohneGmailKategorien).toBe(true);
    expect((await service.find(workspaceId, userId))?.gelesenBis).toBe('40');

    await service.einstellungenSetzen(workspaceId, userId, {
      ausschlussGmailKategorien: false,
    });
    await service.sync(workspaceId, userId);
    expect(reader.lastCredentials?.ohneGmailKategorien).toBe(false);
    expect(reader.lastOptions?.afterUid).toBe(40);
  });
});

describe('Grenzen des Arbeitsbereichs', () => {
  it('findet das Postfach eines anderen Bereichs nicht', async () => {
    await connect();

    expect(await service.find(otherWorkspaceId, userId)).toBeNull();
  });

  it('hält die Postfächer zweier Personen auseinander', async () => {
    await connect();

    const users = dataSource.getRepository(UserEntity);
    const zweite = await users.save(
      users.create({
        email: 'kollege@wir.de',
        passwordHash: 'x',
        firstName: 'Kollege',
        lastName: 'Zwei',
      }),
    );

    expect(await service.find(workspaceId, zweite.id)).toBeNull();
  });

  it('zeigt Nachrichten nicht über die Bereichsgrenze', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 40, messageId: '<k@nordwind.de>' })],
    };
    await service.sync(workspaceId, userId);

    expect(
      await service.forContact(otherWorkspaceId, annaId, BETRACHTER),
    ).toHaveLength(0);
    expect(
      await service.forCompany(otherWorkspaceId, nordwindId, BETRACHTER),
    ).toHaveLength(0);
  });
});

describe('das Postfach trennen', () => {
  it('entfernt es samt Passwort', async () => {
    await connect();

    expect(await service.disconnect(workspaceId, userId)).toBe(true);
    expect(await service.find(workspaceId, userId)).toBeNull();
  });

  it('nimmt die gelesenen Nachrichten mit', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 50, messageId: '<l@nordwind.de>' })],
    };
    await service.sync(workspaceId, userId);
    await service.disconnect(workspaceId, userId);

    expect(
      await service.forContact(workspaceId, annaId, BETRACHTER),
    ).toHaveLength(0);
  });

  it('beschwert sich nicht, wenn keines da ist', async () => {
    expect(await service.disconnect(workspaceId, userId)).toBe(false);
  });
});

describe('Nachrichten zu Gesprächen verketten', () => {
  const fadenVon = async (messageId: string): Promise<string> => {
    const zeile = await dataSource.getRepository(MailMessageEntity).findOne({
      where: { messageId: messageId.replace(/^<|>$/gu, '') },
      select: { threadKey: true },
    });

    if (zeile === null) {
      throw new Error(`Nachricht ${messageId} nicht gespeichert`);
    }

    return zeile.threadKey;
  };

  it('legt eine erste Nachricht in einen eigenen Faden', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 20, messageId: '<eins@nordwind.de>' })],
    };

    await service.sync(workspaceId, userId);

    expect(await fadenVon('<eins@nordwind.de>')).toBe('eins@nordwind.de');
  });

  it('legt eine Antwort in den Faden der Nachricht, auf die sie antwortet', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 20, messageId: '<eins@nordwind.de>' }),
        message({
          uid: 21,
          messageId: '<zwei@nordwind.de>',
          inReplyTo: '<eins@nordwind.de>',
          references: '<eins@nordwind.de>',
        }),
      ],
    };

    await service.sync(workspaceId, userId);

    expect(await fadenVon('<zwei@nordwind.de>')).toBe(
      await fadenVon('<eins@nordwind.de>'),
    );
  });

  it('verkettet auch, wenn die Antwort vor dem Anfang eintrifft', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 20,
          messageId: '<antwort@nordwind.de>',
          inReplyTo: '<wurzel@nordwind.de>',
          references: '<wurzel@nordwind.de>',
        }),
      ],
    };
    await service.sync(workspaceId, userId);

    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 21, messageId: '<wurzel@nordwind.de>' })],
    };
    await service.sync(workspaceId, userId);

    expect(await fadenVon('<wurzel@nordwind.de>')).toBe(
      await fadenVon('<antwort@nordwind.de>'),
    );
  });

  it('findet den Faden auch bei gekürzter Kette', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 20, messageId: '<a@nordwind.de>' }),
        message({
          uid: 21,
          messageId: '<b@nordwind.de>',
          references: '<a@nordwind.de>',
        }),
      ],
    };
    await service.sync(workspaceId, userId);

    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 22,
          messageId: '<c@nordwind.de>',
          references: '<b@nordwind.de>',
          inReplyTo: '<b@nordwind.de>',
        }),
      ],
    };
    await service.sync(workspaceId, userId);

    expect(await fadenVon('<c@nordwind.de>')).toBe(
      await fadenVon('<a@nordwind.de>'),
    );
  });

  it('führt zwei getrennte Fäden zusammen, wenn eine Antwort sie verbindet', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 20, messageId: '<links@nordwind.de>' }),
        message({ uid: 21, messageId: '<rechts@nordwind.de>' }),
      ],
    };
    await service.sync(workspaceId, userId);

    expect(await fadenVon('<links@nordwind.de>')).not.toBe(
      await fadenVon('<rechts@nordwind.de>'),
    );

    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 22,
          messageId: '<bruecke@nordwind.de>',
          references: '<links@nordwind.de> <rechts@nordwind.de>',
        }),
      ],
    };
    await service.sync(workspaceId, userId);

    const faden = await fadenVon('<bruecke@nordwind.de>');

    expect(await fadenVon('<links@nordwind.de>')).toBe(faden);
    expect(await fadenVon('<rechts@nordwind.de>')).toBe(faden);
  });

  it('lässt zwei fremde Nachrichten getrennt', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({ uid: 20, messageId: '<eine@nordwind.de>' }),
        message({ uid: 21, messageId: '<andere@nordwind.de>' }),
      ],
    };

    await service.sync(workspaceId, userId);

    expect(await fadenVon('<eine@nordwind.de>')).not.toBe(
      await fadenVon('<andere@nordwind.de>'),
    );
  });

  it('speichert die Kopfzeilen roh mit', async () => {
    await connect();
    reader.result = {
      uidValidity: 7,
      messages: [
        message({
          uid: 20,
          messageId: '<x@nordwind.de>',
          inReplyTo: '<w@nordwind.de>',
          references: '<v@nordwind.de> <w@nordwind.de>',
        }),
      ],
    };

    await service.sync(workspaceId, userId);

    const zeile = await dataSource.getRepository(MailMessageEntity).findOne({
      where: { messageId: 'x@nordwind.de' },
    });

    expect(zeile?.inReplyTo).toBe('<w@nordwind.de>');
    expect(zeile?.references).toBe('<v@nordwind.de> <w@nordwind.de>');
  });
});

describe('eine Nachricht verschicken', () => {
  beforeEach(() => {
    sender.aufträge = [];
    sender.fehler = null;
  });

  const mitVersand = async (): Promise<void> => {
    await connect();
    await dataSource.getRepository(MailboxEntity).update(
      { workspaceId, userId },
      {
        smtpHost: 'smtp.wir.de',
        smtpPort: 587,
        smtpSecure: false,
      },
    );
  };

  it('verschickt eine Nachricht und legt sie ins Verzeichnis', async () => {
    await mitVersand();

    const gespeichert = await service.senden(workspaceId, userId, {
      an: ['kunde@nordwind.de'],
      betreff: 'Angebot Lagersystem',
      rumpf: 'Guten Tag,\n\nanbei unser Angebot.',
    });

    expect(sender.letzter.an).toEqual(['kunde@nordwind.de']);
    expect(sender.letzter.betreff).toBe('Angebot Lagersystem');
    expect(gespeichert.outgoing).toBe(true);
    expect(gespeichert.subject).toBe('Angebot Lagersystem');
  });

  it('verschickt über die Zugangsdaten des eigenen Postfachs', async () => {
    await mitVersand();

    await service.senden(workspaceId, userId, {
      an: ['kunde@nordwind.de'],
      betreff: 'Test',
      rumpf: 'Text',
    });

    const { zugang } = sender.aufträge.at(-1) ?? { zugang: null };

    expect(zugang?.host).toBe('smtp.wir.de');
    expect(zugang?.port).toBe(587);
    expect(zugang?.passwort).toBe('geheim123456');
  });

  it('ordnet die gesendete Nachricht dem Kontakt zu', async () => {
    await mitVersand();

    const gespeichert = await service.senden(workspaceId, userId, {
      an: ['anna@nordwind.de'],
      betreff: 'Rückfrage',
      rumpf: 'Text',
    });

    expect(gespeichert.contactId).toBe(annaId);
    expect(gespeichert.companyId).toBe(nordwindId);
  });

  it('verweigert den Versand ohne eingerichteten Postausgang', async () => {
    await connect();

    await expect(
      service.senden(workspaceId, userId, {
        an: ['kunde@nordwind.de'],
        betreff: 'Test',
        rumpf: 'Text',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(sender.aufträge).toHaveLength(0);
  });

  it('verweigert den Versand ohne Postfach', async () => {
    await expect(
      service.senden(workspaceId, userId, {
        an: ['kunde@nordwind.de'],
        betreff: 'Test',
        rumpf: 'Text',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    [
      'Betreff mit Zeilenumbruch',
      { betreff: 'Angebot\nBcc: alle@example.test' },
    ],
    ['Empfänger mit Zeilenumbruch', { an: ['a@x.de\nBcc: b@x.de'] }],
    ['ohne Empfänger', { an: [] }],
    ['unbrauchbare Adresse', { an: ['kein-at-zeichen'] }],
  ])('lässt %s nicht bis zum Mailserver', async (_wie, aenderung) => {
    await mitVersand();

    await expect(
      service.senden(workspaceId, userId, {
        an: ['kunde@nordwind.de'],
        betreff: 'Angebot',
        rumpf: 'Text',
        ...aenderung,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(sender.aufträge).toHaveLength(0);
  });

  it('weist mehr als zwanzig Empfänger ab', async () => {
    await mitVersand();

    await expect(
      service.senden(workspaceId, userId, {
        an: Array.from({ length: 21 }, (_, i) => `k${String(i)}@x.de`),
        betreff: 'Rundschreiben',
        rumpf: 'Text',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(sender.aufträge).toHaveLength(0);
  });

  it('speichert nichts, wenn der Versand scheitert', async () => {
    await mitVersand();
    sender.fehler = new VersandFehlgeschlagen(
      'Der Mailserver war nicht erreichbar.',
    );

    const vorher = await service.forContact(workspaceId, annaId, BETRACHTER);

    await expect(
      service.senden(workspaceId, userId, {
        an: ['anna@nordwind.de'],
        betreff: 'Test',
        rumpf: 'Text',
      }),
    ).rejects.toThrow(VersandFehlgeschlagen);

    expect(
      await service.forContact(workspaceId, annaId, BETRACHTER),
    ).toHaveLength(vorher.length);
  });

  it('hängt eine Antwort an das Gespräch, auf das sie antwortet', async () => {
    await mitVersand();
    reader.result = {
      uidValidity: 7,
      messages: [message({ uid: 40, messageId: '<vom-kunden@nordwind.de>' })],
    };
    await service.sync(workspaceId, userId);

    const eingehend = (
      await service.forContact(workspaceId, annaId, BETRACHTER)
    )[0];

    const antwort = await service.senden(workspaceId, userId, {
      an: ['anna@nordwind.de'],
      betreff: 'Re: Anfrage Lagersystem',
      rumpf: 'Gern, anbei.',
      antwortAuf: eingehend.id,
    });

    expect(sender.letzter.inReplyTo).toBe('<vom-kunden@nordwind.de>');
    expect(sender.letzter.references).toBe('<vom-kunden@nordwind.de>');

    expect(antwort.threadKey).toBe(eingehend.threadKey);
  });

  it('antwortet nicht auf eine Nachricht aus einem fremden Arbeitsbereich', async () => {
    await mitVersand();

    await expect(
      service.senden(workspaceId, userId, {
        an: ['anna@nordwind.de'],
        betreff: 'Test',
        rumpf: 'Text',
        antwortAuf: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(sender.aufträge).toHaveLength(0);
  });

  it('vergibt für jede Nachricht eine eigene Kennung', async () => {
    await mitVersand();

    const eine = await service.senden(workspaceId, userId, {
      an: ['a@nordwind.de'],
      betreff: 'Eins',
      rumpf: 'Text',
    });
    const andere = await service.senden(workspaceId, userId, {
      an: ['b@nordwind.de'],
      betreff: 'Zwei',
      rumpf: 'Text',
    });

    expect(eine.messageId).not.toBe(andere.messageId);
    expect(eine.messageId.endsWith('@wir.de')).toBe(true);
  });
});
