import { BadRequestException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { AttachmentBlobEntity } from '../attachments/attachment-blob.entity';
import { AttachmentEntity } from '../attachments/attachment.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  type IncomingMessage,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from './imap-reader';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailboxEntity } from './mailbox.entity';
import { MAX_ANHANG_GESAMT, MailboxesService } from './mailboxes.service';
import { MAX_EMPFAENGER, pruefePost } from './outbound-mail';
import {
  type MailSender,
  type Versandauftrag,
  type Versandzugang,
} from './smtp-sender';
import { nachrichtGesperrt, normalisiereSperre } from './sperrliste';

const BETRACHTER = '00000000-0000-4000-8000-000000000000';

const SUITE = 'b6_postfach';

jest.setTimeout(60_000);

describe('die Sperrliste als Regel', () => {
  it('nimmt Adressen und Domains, klein geschrieben', () => {
    expect(normalisiereSperre(' Info@Werbung.DE ')).toBe('info@werbung.de');
    expect(normalisiereSperre('@Werbung.de')).toBe('@werbung.de');
    expect(normalisiereSperre('Werbung <info@werbung.de>')).toBe(
      'info@werbung.de',
    );
  });

  it('weist Unbrauchbares ab', () => {
    expect(normalisiereSperre('')).toBeNull();
    expect(normalisiereSperre('werbung.de')).toBeNull();
    expect(normalisiereSperre('@localhost')).toBeNull();
    expect(normalisiereSperre('a@b.de\r\nBcc: x@y.de')).toBeNull();
  });

  it('trifft Adresse und Domain, aber keine Unterdomain', () => {
    const sperren = new Set(['info@werbung.de', '@spam.de']);
    const von = (from: string) => ({ from, to: 'ich@wir.de', cc: null });

    expect(
      nachrichtGesperrt(von('info@werbung.de'), sperren, 'ich@wir.de'),
    ).toBe(true);
    expect(
      nachrichtGesperrt(von('Jemand <x@spam.de>'), sperren, 'ich@wir.de'),
    ).toBe(true);
    expect(
      nachrichtGesperrt(von('x@kunde.spam.de'), sperren, 'ich@wir.de'),
    ).toBe(false);
    expect(
      nachrichtGesperrt(von('anna@nordwind.de'), sperren, 'ich@wir.de'),
    ).toBe(false);
  });

  it('sperrt auch die Antwort an einen Gesperrten, nie die eigene Adresse', () => {
    expect(
      nachrichtGesperrt(
        { from: 'ich@wir.de', to: 'info@werbung.de', cc: null },
        new Set(['info@werbung.de']),
        'ich@wir.de',
      ),
    ).toBe(true);
    expect(
      nachrichtGesperrt(
        { from: 'anna@nordwind.de', to: 'ich@wir.de', cc: null },
        new Set(['@wir.de']),
        'ich@wir.de',
      ),
    ).toBe(false);
  });
});

describe('Kopie und Blindkopie in der Prüfung', () => {
  const basis = {
    an: ['anna@nordwind.de'],
    betreff: 'Angebot',
    rumpf: 'Text',
    absender: 'ich@wir.de',
  };

  it('nimmt doppelte Adressen aus Cc und Bcc heraus', () => {
    const ergebnis = pruefePost({
      ...basis,
      cc: ['ANNA@nordwind.de', 'chef@nordwind.de'],
      bcc: ['chef@nordwind.de', 'akte@wir.de'],
    });

    expect(ergebnis.ok && ergebnis.post.cc).toEqual(['chef@nordwind.de']);
    expect(ergebnis.ok && ergebnis.post.bcc).toEqual(['akte@wir.de']);
  });

  it('rechnet Kopien in die Obergrenze ein', () => {
    const viele = Array.from(
      { length: MAX_EMPFAENGER },
      (_, i) => `x${String(i)}@nordwind.de`,
    );

    expect(pruefePost({ ...basis, bcc: viele }).ok).toBe(false);
  });

  it('weist eine Kopfzeile in Cc ab', () => {
    expect(pruefePost({ ...basis, cc: ['a@b.de\r\nSubject: x'] }).ok).toBe(
      false,
    );
  });
});

let dataSource: DataSource;
let service: MailboxesService;
let sender: FakeSender;
let reader: FakeReader;
let workspaceId: string;
let otherWorkspaceId: string;
let userId: string;
let annaId: string;
let nordwindId: string;

const KEY = randomBytes(32).toString('base64');

class FakeReader implements MailReader {
  public messages: IncomingMessage[] = [];
  public afterUids: number[] = [];

  check(): Promise<void> {
    return Promise.resolve();
  }

  read(_: unknown, options: ReadOptions): Promise<ReadResult> {
    this.afterUids.push(options.afterUid);

    return Promise.resolve({
      uidValidity: 7,
      messages: this.messages.filter((m) => m.uid > options.afterUid),
    });
  }
}

class FakeSender implements MailSender {
  aufträge: Versandauftrag[] = [];

  send(_: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    this.aufträge.push(auftrag);

    return Promise.resolve();
  }
}

const nachricht = (
  uid: number,
  from: string,
  messageId: string,
): IncomingMessage => ({
  uid,
  messageId,
  from,
  to: 'ich@wir.de',
  cc: null,
  subject: 'Hallo',
  sentAt: new Date('2026-03-12T09:14:00Z'),
  inReplyTo: null,
  references: null,
  text: 'Text',
});

const verbinden = async (): Promise<void> => {
  await service.connect(workspaceId, userId, {
    host: 'imap.example.de',
    port: 993,
    secure: true,
    username: 'ich@wir.de',
    password: 'geheim123456',
    folder: 'INBOX',
  });
  await dataSource
    .getRepository(MailboxEntity)
    .update(
      { workspaceId, userId },
      { smtpHost: 'smtp.wir.de', smtpPort: 587, smtpSecure: false },
    );
};

const anhang = async (
  bereich: string,
  name: string,
  sizeBytes: number,
): Promise<string> => {
  const zeile = await dataSource.getRepository(AttachmentEntity).save(
    dataSource.getRepository(AttachmentEntity).create({
      workspaceId: bereich,
      name,
      mimeType: 'application/pdf',
      sizeBytes,
      companyId: bereich === workspaceId ? nordwindId : null,
      contactId: null,
    }),
  );

  await dataSource.getRepository(AttachmentBlobEntity).save({
    attachmentId: zeile.id,
    bytes: Buffer.from(`Inhalt von ${name}`),
  });

  return zeile.id;
};

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
    'TRUNCATE TABLE mail_sperren, attachments, mail_messages, mailboxes, deals, contacts, companies, workspaces, users CASCADE',
  );

  reader.messages = [];
  reader.afterUids = [];
  sender.aufträge = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;
  userId = (
    await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: 'ich@wir.de',
        passwordHash: 'x',
        firstName: 'Ich',
        lastName: 'Selbst',
      }),
    )
  ).id;
  nordwindId = (
    await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Nordwind Logistik GmbH',
        domain: 'nordwind.de',
      }),
    )
  ).id;
  annaId = (
    await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Anna',
        lastName: 'Schmidt',
        email: 'anna@nordwind.de',
        companyId: nordwindId,
      }),
    )
  ).id;
});

describe('senden mit Kopie und Anhängen', () => {
  it('gibt Cc, Bcc und Dateien an den Versand weiter', async () => {
    await verbinden();
    const vertrag = await anhang(workspaceId, 'Vertrag.pdf', 1000);

    await service.senden(workspaceId, userId, {
      an: ['buchhaltung@lager.de'],
      cc: ['anna@nordwind.de'],
      bcc: ['akte@wir.de'],
      betreff: 'Vertrag',
      rumpf: 'Anbei.',
      anhangIds: [vertrag],
    });

    const auftrag = sender.aufträge.at(-1);

    expect(auftrag?.cc).toEqual(['anna@nordwind.de']);
    expect(auftrag?.bcc).toEqual(['akte@wir.de']);
    expect(auftrag?.anhaenge?.map((a) => a.name)).toEqual(['Vertrag.pdf']);
    expect(auftrag?.anhaenge?.[0]?.bytes.toString()).toBe(
      'Inhalt von Vertrag.pdf',
    );
  });

  it('ordnet über Cc dem Kontakt zu', async () => {
    await verbinden();

    const gespeichert = await service.senden(workspaceId, userId, {
      an: ['buchhaltung@lager.de'],
      cc: ['anna@nordwind.de'],
      betreff: 'Rückfrage',
      rumpf: 'Text',
    });

    expect(gespeichert.contactId).toBe(annaId);
  });

  it('weist mehr als zwanzig Megabyte zusammen ab, ohne zu senden', async () => {
    await verbinden();
    const halb = Math.ceil(MAX_ANHANG_GESAMT / 2) + 1;
    const a = await anhang(workspaceId, 'a.pdf', halb);
    const b = await anhang(workspaceId, 'b.pdf', halb);

    await expect(
      service.senden(workspaceId, userId, {
        an: ['anna@nordwind.de'],
        betreff: 'Zu groß',
        rumpf: 'Text',
        anhangIds: [a, b],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sender.aufträge).toHaveLength(0);
  });

  it('verschickt keine Datei aus einem fremden Arbeitsbereich', async () => {
    await verbinden();
    const fremd = await anhang(otherWorkspaceId, 'Fremd.pdf', 10);

    await expect(
      service.senden(workspaceId, userId, {
        an: ['anna@nordwind.de'],
        betreff: 'Fremd',
        rumpf: 'Text',
        anhangIds: [fremd],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.anhangZiele(workspaceId, [fremd]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sender.aufträge).toHaveLength(0);
  });

  it('nennt die Akte, an der eine Datei hängt', async () => {
    const vertrag = await anhang(workspaceId, 'Vertrag.pdf', 10);

    expect(await service.anhangZiele(workspaceId, [vertrag])).toEqual([
      expect.objectContaining({ companyId: nordwindId, contactId: null }),
    ]);
  });
});

describe('der Schriftwechsel am Geschäft', () => {
  it('zeigt, was mit Hauptkontakt und Firma geschrieben wurde', async () => {
    await verbinden();
    const deals = dataSource.getRepository(DealEntity);
    const deal = await deals.save(
      deals.create({
        workspaceId,
        name: 'Lagersystem',
        primaryContactId: annaId,
      }),
    );
    const nurFirma = await deals.save(
      deals.create({ workspaceId, name: 'Wartung', companyId: nordwindId }),
    );
    const leer = await deals.save(deals.create({ workspaceId, name: 'Leer' }));

    reader.messages = [
      nachricht(1, 'Anna Schmidt <anna@nordwind.de>', 'a@nordwind.de'),
      nachricht(2, 'chef@nordwind.de', 'b@nordwind.de'),
      nachricht(3, 'fremd@woanders.de', 'c@woanders.de'),
    ];
    await service.sync(workspaceId, userId);

    const zuDeal = await service.forDeal(workspaceId, deal.id, BETRACHTER);
    const zuFirma = await service.forDeal(workspaceId, nurFirma.id, BETRACHTER);

    expect(zuDeal.map((m) => m.messageId)).toEqual(['a@nordwind.de']);
    expect(zuFirma.map((m) => m.messageId).sort()).toEqual([
      'a@nordwind.de',
      'b@nordwind.de',
    ]);
    expect(await service.forDeal(workspaceId, leer.id, BETRACHTER)).toEqual([]);
    await expect(
      service.forDeal(otherWorkspaceId, deal.id, BETRACHTER),
    ).rejects.toThrow('Geschäft nicht gefunden.');
  });
});

describe('die Sperrliste beim Abruf', () => {
  it('speichert nichts von gesperrten Absendern und liest sie nicht wieder', async () => {
    await verbinden();
    await service.sperreHinzufuegen(workspaceId, userId, '@werbung.de');

    reader.messages = [
      nachricht(1, 'anna@nordwind.de', 'a@nordwind.de'),
      nachricht(2, 'news@werbung.de', 'n@werbung.de'),
    ];
    const ergebnis = await service.sync(workspaceId, userId);

    expect(ergebnis.stored).toBe(1);
    expect(
      await dataSource.getRepository(MailMessageEntity).countBy({
        messageId: 'n@werbung.de',
      }),
    ).toBe(0);

    await service.sync(workspaceId, userId);
    expect(reader.afterUids.at(-1)).toBe(2);
  });

  it('gilt nur im eigenen Arbeitsbereich und kennt jeden Eintrag einmal', async () => {
    await service.sperreHinzufuegen(workspaceId, userId, 'Info@Werbung.de');
    await service.sperreHinzufuegen(workspaceId, userId, 'info@werbung.de');

    expect(
      (await service.listSperren(workspaceId)).map((s) => s.eintrag),
    ).toEqual(['info@werbung.de']);
    expect(await service.listSperren(otherWorkspaceId)).toEqual([]);

    const [eintrag] = await service.listSperren(workspaceId);

    expect(await service.sperreEntfernen(otherWorkspaceId, eintrag.id)).toBe(
      false,
    );
    expect(await service.sperreEntfernen(workspaceId, eintrag.id)).toBe(true);
  });

  it('weist einen unbrauchbaren Eintrag ab', async () => {
    await expect(
      service.sperreHinzufuegen(workspaceId, userId, 'werbung'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
