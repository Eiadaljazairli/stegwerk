import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { AttachmentBlobEntity } from '../attachments/attachment-blob.entity';
import { AttachmentEntity } from '../attachments/attachment.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  anhangSchluessel,
  type IncomingMessage,
  type MailboxCredentials,
  MailboxUnreachableError,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from './imap-reader';
import {
  istGruppenadresse,
  istNurFreemail,
  istVonGruppenadresse,
} from './kundenpost';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService, pruefeAliase } from './mailboxes.service';
import {
  anhaengeVon,
  htmlTeilen,
  htmlToText,
  teileText,
} from './message-shape';
import {
  type MailSender,
  type Versandauftrag,
  versandGrund,
} from './smtp-sender';

const SUITE = 'postfach_ausbau';

jest.setTimeout(60_000);

describe('Text teilen', () => {
  it('trennt eine Antwort mit Einleitungszeile', () => {
    const { eigen, rest } = teileText(
      [
        'Passt, wir nehmen Variante B.',
        '',
        'Viele Grüße',
        'Anna',
        '',
        'Am 12.03.2026 um 10:14 schrieb Jonas Weber <jonas@wir.de>:',
        '> Welche Variante soll es sein?',
      ].join('\r\n'),
    );

    expect(eigen).toBe('Passt, wir nehmen Variante B.\n\nViele Grüße\nAnna');
    expect(rest).toContain('schrieb Jonas Weber');
    expect(rest).toContain('> Welche Variante');
  });

  it('nimmt die Signatur in den eingeklappten Teil', () => {
    const { eigen, rest } = teileText(
      'Danke!\n-- \nAnna Alt\nNordwind GmbH, HRB 1234',
    );

    expect(eigen).toBe('Danke!');
    expect(rest).toContain('HRB 1234');
  });

  it('lässt Antworten zwischen den Zeilen stehen und schneidet erst das Zitat am Ende', () => {
    const { eigen, rest } = teileText(
      [
        '> Liefertermin?',
        'KW 14.',
        '> Preis?',
        'Wie besprochen.',
        '',
        '> Grüße',
        '> Jonas',
      ].join('\n'),
    );

    expect(eigen).toBe('> Liefertermin?\nKW 14.\n> Preis?\nWie besprochen.');
    expect(rest).toBe('> Grüße\n> Jonas');
  });

  it('macht aus reinem Zitat den Text', () => {
    expect(teileText('> nur Zitat')).toEqual({
      eigen: '> nur Zitat',
      rest: '',
    });
  });

  it('teilt HTML am Zitatblock', () => {
    const { eigen, zitat } = htmlTeilen(
      '<p>Gern.</p><div class="gmail_quote">Am Montag schrieb Jonas:<blockquote>Frage</blockquote></div>',
    );

    expect(htmlToText(eigen).trim()).toBe('Gern.');
    expect(htmlToText(zitat)).toContain('Frage');
  });
});

describe('Anhänge in der Struktur', () => {
  it('findet Anhänge, übergeht eingebettete Bilder, Signaturen und Kalender', () => {
    expect(
      anhaengeVon({
        type: 'multipart/mixed',
        childNodes: [
          {
            part: '1',
            type: 'multipart/related',
            childNodes: [
              { part: '1.1', type: 'text/html' },
              {
                part: '1.2',
                type: 'image/png',
                disposition: 'inline',
                dispositionParameters: { filename: 'logo.png' },
              },
            ],
          },
          {
            part: '2',
            type: 'application/pdf',
            disposition: 'attachment',
            dispositionParameters: { filename: 'Angebot.pdf' },
            encoding: 'base64',
            size: 4000,
          },
          {
            part: '3',
            type: 'application/vnd.ms-excel',
            parameters: { name: 'Preise.xls' },
            size: 900,
          },
          { part: '4', type: 'text/calendar', disposition: 'attachment' },
          { part: '5', type: 'application/pkcs7-signature' },
        ],
      }),
    ).toEqual([
      {
        teil: '2',
        name: 'Angebot.pdf',
        mimeType: 'application/pdf',
        groesse: 3000,
      },
      {
        teil: '3',
        name: 'Preise.xls',
        mimeType: 'application/vnd.ms-excel',
        groesse: 900,
      },
    ]);
  });
});

describe('Ausschlüsse', () => {
  const eigene = new Set(['ich@wir.de']);

  it('erkennt Gruppenadressen, nicht aber Personen', () => {
    expect(istGruppenadresse('Info@Nordwind.de')).toBe(true);
    expect(istGruppenadresse('kontakt@nordwind.de')).toBe(true);
    expect(istGruppenadresse('anna.info@nordwind.de')).toBe(false);
    expect(
      istVonGruppenadresse({ from: 'info@wir.de' }, new Set(['info@wir.de'])),
    ).toBe(false);
  });

  it('erkennt Post nur mit Freemailern', () => {
    expect(
      istNurFreemail({ from: 'kunde@gmx.de', to: 'ich@wir.de' }, eigene),
    ).toBe(true);
    expect(
      istNurFreemail(
        { from: 'kunde@gmx.de', to: 'ich@wir.de', cc: 'anna@nordwind.de' },
        eigene,
      ),
    ).toBe(false);
  });
});

describe('Absender', () => {
  it('prüft weitere Absenderadressen', () => {
    expect(
      pruefeAliase(
        ['Vertrieb@Wir.de', 'vertrieb@wir.de', 'ich@wir.de'],
        'ich@wir.de',
      ),
    ).toEqual(['vertrieb@wir.de']);
    expect(() => pruefeAliase(['kein-at'], 'ich@wir.de')).toThrow(
      'keine gültige',
    );
    expect(() =>
      pruefeAliase(
        Array.from({ length: 11 }, (_, i) => `a${String(i)}@wir.de`),
        'ich@wir.de',
      ),
    ).toThrow('Höchstens');
  });

  it('übersetzt die Ablehnung eines Absenders', () => {
    expect(
      versandGrund({ responseCode: 553, response: '553 5.7.1' }),
    ).toContain('Absenderadresse');
    expect(
      versandGrund({
        responseCode: 554,
        response:
          '554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException',
      }),
    ).toContain('Absenderadresse');
    expect(
      versandGrund({ responseCode: 550, response: '550 user unknown' }),
    ).toBe('Der Mailserver hat die Nachricht abgelehnt (550).');
  });
});

const KEY = randomBytes(32).toString('base64');

class FakeReader implements MailReader {
  public ordner: Record<string, IncomingMessage[]> = {};
  public dateien = new Map<string, Buffer>();
  public geladen: string[] = [];
  public rueckrufe = 0;
  public ausfall: Error | null = null;

  check(): Promise<void> {
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

  async anhaengeLaden(
    credentials: MailboxCredentials,
    auftraege: { messageId: string; teil: string }[],
    hoechstens: number,
    jeAnhang?: (schluessel: string, bytes: Buffer) => Promise<void>,
  ): Promise<Map<string, Buffer>> {
    if (this.ausfall !== null) {
      throw this.ausfall;
    }

    const ergebnis = new Map<string, Buffer>();

    for (const auftrag of auftraege) {
      const schluessel = anhangSchluessel(auftrag.messageId, auftrag.teil);
      const bytes = this.dateien.get(schluessel);

      this.geladen.push(`${credentials.folder}:${schluessel}`);

      if (bytes === undefined || bytes.length > hoechstens) {
        continue;
      }

      if (jeAnhang === undefined) {
        ergebnis.set(schluessel, bytes);
      } else {
        this.rueckrufe += 1;
        await jeAnhang(schluessel, bytes);
      }
    }

    return ergebnis;
  }
}

class MerkenderVersand implements MailSender {
  public auftraege: Versandauftrag[] = [];

  send(_zugang: unknown, auftrag: Versandauftrag): Promise<void> {
    this.auftraege.push(auftrag);

    return Promise.resolve();
  }
}

let dataSource: DataSource;
let service: MailboxesService;
let reader: FakeReader;
let versand: MerkenderVersand;
let workspaceId: string;
let ichId: string;
let kollegeId: string;
let annaId: string;

const nachricht = (
  uid: number,
  von: string,
  messageId: string,
  extra: Partial<IncomingMessage> = {},
): IncomingMessage => ({
  uid,
  messageId,
  from: von,
  to: 'kollege@wir.de',
  cc: null,
  subject: 'Angebot',
  sentAt: new Date(),
  inReplyTo: null,
  references: null,
  text: 'Anbei das Angebot.\n\nAm Montag schrieb Kollege:\n> Schicken Sie es?',
  ...extra,
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

const verbinden = (userId: string, adresse: string) =>
  service.connect(workspaceId, userId, {
    host: 'imap.example.de',
    port: 993,
    secure: true,
    username: adresse,
    password: 'geheim123456',
    folder: 'INBOX',
    smtpHost: 'smtp.example.de',
    smtpPort: 587,
  });

const gespeichert = (subject?: string) =>
  dataSource.getRepository(MailMessageEntity).find({
    where: subject === undefined ? { workspaceId } : { workspaceId, subject },
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  reader = new FakeReader();
  versand = new MerkenderVersand();
  service = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    versand,
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
    'TRUNCATE TABLE attachment_blobs, attachments, mail_messages, mailboxes, contacts, companies, workspaces, users CASCADE',
  );
  reader.ordner = {};
  reader.dateien = new Map();
  reader.geladen = [];
  reader.rueckrufe = 0;
  reader.ausfall = null;
  versand.auftraege = [];

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
  annaId = (
    await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Anna',
        lastName: 'Alt',
        email: 'anna@nordwind.de',
      }),
    )
  ).id;
  await verbinden(kollegeId, 'kollege@wir.de');
});

describe('der ganze Text', () => {
  it('speichert Eigenes und Zitat getrennt und zeigt beides', async () => {
    reader.ordner.INBOX = [nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de')];
    await service.sync(workspaceId, kollegeId);

    const [zeile] = await gespeichert();
    const [inhalt] = await service.mailInhalte(workspaceId, ichId, [zeile.id]);

    expect(inhalt.inhalt).toBe('Anbei das Angebot.');
    expect(inhalt.zitat).toContain('> Schicken Sie es?');
    expect(inhalt.inhaltVerborgen).toBe(false);
  });

  it('nimmt das HTML-Zitat, das der Leser schon abgetrennt hat', async () => {
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de', {
        text: 'Gern.',
        zitat: 'Frage von gestern',
      }),
    ];
    await service.sync(workspaceId, kollegeId);

    const [zeile] = await gespeichert();

    expect(zeile.inhalt).toBe('Gern.');
    expect(zeile.zitat).toBe('Frage von gestern');
  });

  it('verbirgt Text und Anhänge bei „nur Betreff“ und private Post ganz', async () => {
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de', {
        anhaenge: [
          { teil: '2', name: 'x.pdf', mimeType: 'application/pdf', groesse: 3 },
        ],
      }),
    ];
    await service.sync(workspaceId, kollegeId);
    const [zeile] = await gespeichert();

    await service.sichtbarkeitSetzen(workspaceId, kollegeId, 'kopf');

    const [fremd] = await service.mailInhalte(workspaceId, ichId, [zeile.id]);
    const [eigen] = await service.mailInhalte(workspaceId, kollegeId, [
      zeile.id,
    ]);

    expect(fremd).toEqual({
      id: zeile.id,
      inhalt: null,
      zitat: null,
      inhaltVerborgen: true,
      anhaenge: [],
    });
    expect(eigen.inhalt).toBe('Anbei das Angebot.');
    expect(eigen.anhaenge).toHaveLength(1);

    const [liste] = await service.forContact(workspaceId, annaId, ichId);

    expect(liste.anhangAnzahl).toBe(0);

    await service.sichtbarkeitSetzen(workspaceId, kollegeId, 'privat');

    expect(await service.mailInhalte(workspaceId, ichId, [zeile.id])).toEqual(
      [],
    );
  });

  it('zeigt bei alter Post ohne gespeicherten Text den Ausschnitt', async () => {
    reader.ordner.INBOX = [nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de')];
    await service.sync(workspaceId, kollegeId);
    const [zeile] = await gespeichert();

    await dataSource.query(
      `UPDATE mail_messages SET inhalt = NULL, zitat = NULL WHERE id = $1`,
      [zeile.id],
    );

    const [inhalt] = await service.mailInhalte(workspaceId, ichId, [zeile.id]);

    expect(inhalt.inhalt).toBe(zeile.snippet);
  });

  it('kennt keine Kennungen aus einem anderen Arbeitsbereich', async () => {
    reader.ordner.INBOX = [nachricht(1, 'anna@nordwind.de', 'a1@nordwind.de')];
    await service.sync(workspaceId, kollegeId);
    const [zeile] = await gespeichert();
    const anderer = (
      await dataSource
        .getRepository(WorkspaceEntity)
        .save(
          dataSource
            .getRepository(WorkspaceEntity)
            .create({ name: 'Andere', slug: 'andere' }),
        )
    ).id;

    expect(await service.mailInhalte(anderer, ichId, [zeile.id])).toEqual([]);
  });
});

describe('einstellbare Ausschlüsse', () => {
  const einlesen = async () => {
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'kunde@x', { subject: 'Kunde' }),
      nachricht(2, 'ich@wir.de', 'intern@x', { subject: 'Intern' }),
      nachricht(3, 'info@nordwind.de', 'gruppe@x', { subject: 'Gruppe' }),
      nachricht(4, 'privat@gmx.de', 'freemail@x', { subject: 'Freemail' }),
      nachricht(5, 'aktuell@laden.de', 'news@x', {
        subject: 'Newsletter',
        massenpost: true,
      }),
    ];
    await service.sync(workspaceId, kollegeId);

    return (await gespeichert()).map((zeile) => zeile.subject).sort();
  };

  it('lässt standardmäßig interne Post und Newsletter weg, Gruppen und Freemail nicht', async () => {
    expect(await einlesen()).toEqual(['Freemail', 'Gruppe', 'Kunde']);
  });

  it('folgt den Schaltern', async () => {
    await service.einstellungenSetzen(workspaceId, kollegeId, {
      ausschlussIntern: false,
      ausschlussMassenpost: false,
      ausschlussGruppen: true,
      ausschlussFreemail: true,
    });

    expect(await einlesen()).toEqual(['Intern', 'Kunde', 'Newsletter']);
  });
});

describe('weitere Absenderadressen', () => {
  it('sendet unter einem eingetragenen Alias und erkennt ihn als eigene Post', async () => {
    await service.einstellungenSetzen(workspaceId, kollegeId, {
      aliase: ['Vertrieb@wir.de'],
    });

    await service.senden(workspaceId, kollegeId, {
      an: ['anna@nordwind.de'],
      betreff: 'Angebot',
      rumpf: 'Anbei.',
      absender: 'vertrieb@wir.de',
    });

    expect(versand.auftraege[0].von).toBe('vertrieb@wir.de');

    reader.ordner.INBOX = [
      nachricht(1, 'vertrieb@wir.de', 'v1@wir.de', { to: 'anna@nordwind.de' }),
    ];
    await service.sync(workspaceId, kollegeId);

    const eingelesen = (await gespeichert()).find(
      (zeile) => zeile.messageId === 'v1@wir.de',
    );

    expect(eingelesen?.outgoing).toBe(true);
  });

  it('weist eine Adresse ab, die nicht am Postfach steht', async () => {
    await expect(
      service.senden(workspaceId, kollegeId, {
        an: ['anna@nordwind.de'],
        betreff: 'Angebot',
        rumpf: 'Anbei.',
        absender: 'chef@wir.de',
      }),
    ).rejects.toThrow('nicht eingetragen');
    expect(versand.auftraege).toHaveLength(0);
  });
});

describe('Anhänge an die Akte', () => {
  const MIT_ANHANG = (uid: number, groesse = 5) =>
    nachricht(uid, 'anna@nordwind.de', `m${String(uid)}@nordwind.de`, {
      anhaenge: [
        {
          teil: '2',
          name: 'Angebot.pdf',
          mimeType: 'application/pdf',
          groesse,
        },
      ],
    });

  it('holt einen Anhang auf Wunsch an den Kontakt, nur einmal', async () => {
    reader.ordner.INBOX = [MIT_ANHANG(1)];
    reader.dateien.set(
      anhangSchluessel('m1@nordwind.de', '2'),
      Buffer.from('%PDF-'),
    );
    await service.sync(workspaceId, kollegeId);
    const [zeile] = await gespeichert();

    const ergebnis = await service.anhangAnAkte(
      workspaceId,
      ichId,
      zeile.id,
      0,
    );

    const [datei] = await dataSource
      .getRepository(AttachmentEntity)
      .find({ where: { workspaceId } });

    expect(datei.contactId).toBe(annaId);
    expect(datei.name).toBe('Angebot.pdf');
    expect(datei.uploadedById).toBe(ichId);
    expect(ergebnis.anhaenge[0].gespeichertId).toBe(datei.id);

    const blob = await dataSource
      .getRepository(AttachmentBlobEntity)
      .findOneByOrFail({ attachmentId: datei.id });

    expect(blob.bytes.toString()).toBe('%PDF-');

    await service.anhangAnAkte(workspaceId, ichId, zeile.id, 0);

    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(1);
  });

  it('gibt bei „nur Betreff“ der Kollegin nichts heraus', async () => {
    reader.ordner.INBOX = [MIT_ANHANG(1)];
    reader.dateien.set(
      anhangSchluessel('m1@nordwind.de', '2'),
      Buffer.from('%PDF-'),
    );
    await service.sync(workspaceId, kollegeId);
    await service.sichtbarkeitSetzen(workspaceId, kollegeId, 'kopf');
    const [zeile] = await gespeichert();

    await expect(
      service.anhangAnAkte(workspaceId, ichId, zeile.id, 0),
    ).rejects.toThrow('bleiben im Postfach');
    expect(reader.geladen).toHaveLength(0);
  });

  it('sagt es, wenn der Anhang im Postfach fehlt', async () => {
    reader.ordner.INBOX = [MIT_ANHANG(1)];
    await service.sync(workspaceId, kollegeId);
    const [zeile] = await gespeichert();

    await expect(
      service.anhangAnAkte(workspaceId, ichId, zeile.id, 0),
    ).rejects.toThrow('nicht mehr zu finden');
  });

  it('übernimmt von selbst bis zur Grenze, nur bei Post, die alle sehen', async () => {
    await service.einstellungenSetzen(workspaceId, kollegeId, {
      anhaengeAutomatisch: true,
      anhaengeBisMb: 1,
    });
    reader.ordner.INBOX = [MIT_ANHANG(1), MIT_ANHANG(2, 2 * 1024 * 1024)];
    reader.dateien.set(
      anhangSchluessel('m1@nordwind.de', '2'),
      Buffer.from('a'),
    );
    reader.dateien.set(
      anhangSchluessel('m2@nordwind.de', '2'),
      Buffer.from('b'),
    );
    await service.sync(workspaceId, kollegeId);

    const dateien = await dataSource
      .getRepository(AttachmentEntity)
      .find({ where: { workspaceId } });

    expect(dateien).toHaveLength(1);
    expect(dateien[0].uploadedById).toBe(kollegeId);
    expect(reader.geladen).toEqual(['INBOX:m1@nordwind.de|2']);

    await service.sichtbarkeitSetzen(workspaceId, kollegeId, 'kopf');
    reader.ordner.INBOX.push(MIT_ANHANG(3));
    reader.dateien.set(
      anhangSchluessel('m3@nordwind.de', '2'),
      Buffer.from('c'),
    );
    await service.sync(workspaceId, kollegeId);

    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(1);
  });

  it('prüft die Grenzen der Einstellungen', async () => {
    await expect(
      service.einstellungenSetzen(workspaceId, kollegeId, {
        anhaengeBisMb: 50,
      }),
    ).rejects.toThrow('zwischen 1 und 20');
  });
});

describe('Anhänge von selbst: Rahmen je Abruf und Platz', () => {
  const MB = 1024 * 1024;
  const GROSS = (uid: number) =>
    nachricht(uid, 'anna@nordwind.de', `g${String(uid)}@nordwind.de`, {
      anhaenge: [
        {
          teil: '2',
          name: `Rechnung${String(uid)}.pdf`,
          mimeType: 'application/pdf',
          groesse: 20 * MB,
        },
      ],
    });

  beforeEach(async () => {
    await service.einstellungenSetzen(workspaceId, kollegeId, {
      anhaengeAutomatisch: true,
      anhaengeBisMb: 20,
    });
  });

  it('speichert jede Datei gleich und holt über den Rahmen hinaus erst beim nächsten Abruf', async () => {
    const uids = [1, 2, 3, 4, 5, 6];

    reader.ordner.INBOX = uids.map(GROSS);

    for (const uid of uids) {
      reader.dateien.set(
        anhangSchluessel(`g${String(uid)}@nordwind.de`, '2'),
        Buffer.from(String(uid)),
      );
    }

    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(5);
    expect(reader.rueckrufe).toBe(5);
    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(5);

    const wartend = (await gespeichert()).find(
      (zeile) => zeile.messageId === 'g6@nordwind.de',
    );

    expect(wartend?.anhaenge[0].ausstehend).toBe(true);

    reader.geladen = [];
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toEqual(['INBOX:g6@nordwind.de|2']);
    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(6);

    const geholt = (await gespeichert()).find(
      (zeile) => zeile.messageId === 'g6@nordwind.de',
    );

    expect(geholt?.anhaenge[0].ausstehend).toBeUndefined();
    expect(geholt?.anhaenge[0].gespeichertId).toEqual(expect.any(String));

    reader.geladen = [];
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(0);
  });

  const sechsGrosse = async () => {
    const uids = [1, 2, 3, 4, 5, 6];

    reader.ordner.INBOX = uids.map(GROSS);

    for (const uid of uids) {
      reader.dateien.set(
        anhangSchluessel(`g${String(uid)}@nordwind.de`, '2'),
        Buffer.from(String(uid)),
      );
    }

    await service.sync(workspaceId, kollegeId);
    expect(reader.geladen).toHaveLength(5);
    reader.geladen = [];
  };

  const sechste = async () =>
    (await gespeichert()).find((zeile) => zeile.messageId === 'g6@nordwind.de');

  it('behält die Vormerkung, wenn das Postfach beim Laden nicht erreichbar ist', async () => {
    await sechsGrosse();

    reader.ausfall = new MailboxUnreachableError('Postfach antwortet nicht.');
    await service.sync(workspaceId, kollegeId);

    expect((await sechste())?.anhaenge[0].ausstehend).toBe(true);

    reader.ausfall = null;
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toEqual(['INBOX:g6@nordwind.de|2']);
    expect((await sechste())?.anhaenge[0].gespeichertId).toEqual(
      expect.any(String),
    );
  });

  it('merkt neue Anhänge vor, wenn das Postfach beim Laden ausfällt', async () => {
    reader.ausfall = new MailboxUnreachableError('Postfach antwortet nicht.');
    reader.ordner.INBOX = [GROSS(1)];
    reader.dateien.set(
      anhangSchluessel('g1@nordwind.de', '2'),
      Buffer.from('1'),
    );
    await service.sync(workspaceId, kollegeId);

    const [zeile] = await gespeichert();

    expect(zeile.anhaenge[0].ausstehend).toBe(true);

    reader.ausfall = null;
    await service.sync(workspaceId, kollegeId);

    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(1);
  });

  it('nimmt die Vormerkung weg, wenn die Nachricht keine Akte mehr hat', async () => {
    await sechsGrosse();
    const wartend = await sechste();

    await dataSource
      .getRepository(MailMessageEntity)
      .update(wartend?.id ?? '', { contactId: null, companyId: null });
    await dataSource
      .getRepository(ContactEntity)
      .update(annaId, { email: 'anna@woanders.de' });
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(0);
    expect((await sechste())?.anhaenge[0].ausstehend).toBeUndefined();
  });

  it('nimmt die Vormerkung weg, wenn die Grenze gesenkt wurde', async () => {
    await sechsGrosse();

    await service.einstellungenSetzen(workspaceId, kollegeId, {
      anhaengeBisMb: 10,
    });
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(0);
    expect((await sechste())?.anhaenge[0].ausstehend).toBeUndefined();
  });

  it('versucht einen vorgemerkten Anhang nur einmal, wenn er im Postfach fehlt', async () => {
    await sechsGrosse();
    reader.dateien.delete(anhangSchluessel('g6@nordwind.de', '2'));

    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toEqual(['INBOX:g6@nordwind.de|2']);
    expect((await sechste())?.anhaenge[0].ausstehend).toBeUndefined();

    reader.geladen = [];
    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(0);
  });

  it('lädt nichts, wenn der Platz des Arbeitsbereichs voll ist', async () => {
    await dataSource.getRepository(AttachmentEntity).save(
      dataSource.getRepository(AttachmentEntity).create({
        workspaceId,
        name: 'alt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2 ** 31 - 1,
        contactId: annaId,
      }),
    );
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'v1@nordwind.de', {
        anhaenge: [
          { teil: '2', name: 'a.pdf', mimeType: 'application/pdf', groesse: 5 },
        ],
      }),
    ];
    reader.dateien.set(
      anhangSchluessel('v1@nordwind.de', '2'),
      Buffer.from('%PDF-'),
    );

    await service.sync(workspaceId, kollegeId);

    expect(reader.geladen).toHaveLength(0);
    expect(
      await dataSource.getRepository(AttachmentEntity).countBy({ workspaceId }),
    ).toBe(1);
  });
});

describe('dieselbe Mail in zwei Postfächern', () => {
  beforeEach(async () => {
    await verbinden(ichId, 'ich@wir.de');
    reader.ordner.INBOX = [
      nachricht(1, 'anna@nordwind.de', 'r1@nordwind.de', {
        cc: 'ich@wir.de',
        anhaenge: [
          {
            teil: '2',
            name: 'rechnung.pdf',
            mimeType: 'application/pdf',
            groesse: 5,
          },
        ],
      }),
    ];
    reader.dateien.set(
      anhangSchluessel('r1@nordwind.de', '2'),
      Buffer.from('%PDF-'),
    );
  });

  it('hängt den Anhang von selbst nur einmal an die Akte', async () => {
    for (const userId of [kollegeId, ichId]) {
      await service.einstellungenSetzen(workspaceId, userId, {
        anhaengeAutomatisch: true,
      });
    }

    await service.sync(workspaceId, kollegeId);
    await service.sync(workspaceId, ichId);

    const dateien = await dataSource
      .getRepository(AttachmentEntity)
      .find({ where: { workspaceId } });
    const zeilen = await gespeichert();

    expect(dateien).toHaveLength(1);
    expect(zeilen).toHaveLength(2);
    expect(zeilen.map((zeile) => zeile.anhaenge[0].gespeichertId)).toEqual([
      dateien[0].id,
      dateien[0].id,
    ]);
    expect(reader.geladen).toHaveLength(1);
  });

  it('legt mit „An Akte speichern“ an der zweiten Kopie nichts neu an', async () => {
    await service.sync(workspaceId, kollegeId);
    await service.sync(workspaceId, ichId);
    const [erste, zweite] = await gespeichert();

    await service.anhangAnAkte(workspaceId, ichId, erste.id, 0);
    const ergebnis = await service.anhangAnAkte(
      workspaceId,
      ichId,
      zweite.id,
      0,
    );

    const dateien = await dataSource
      .getRepository(AttachmentEntity)
      .find({ where: { workspaceId } });

    expect(dateien).toHaveLength(1);
    expect(ergebnis.anhaenge[0].gespeichertId).toBe(dateien[0].id);
    expect(reader.geladen).toHaveLength(1);
  });
});

describe('nachträgliche Zuordnung über Domains', () => {
  it('gibt alte Post der Firma mit der Hauptdomain, nicht der mit der weiteren', async () => {
    reader.ordner.INBOX = [
      nachricht(1, 'jonas@nordwind.de', 'd1@nordwind.de', { subject: 'Alt' }),
    ];
    await service.sync(workspaceId, kollegeId);

    const firmen = dataSource.getRepository(CompanyEntity);
    const a = await firmen.save(
      firmen.create({
        workspaceId,
        name: 'A',
        domain: 'a-handel.de',
        zweitdomains: ['nordwind.de'],
      }),
    );
    const b = await firmen.save(
      firmen.create({ workspaceId, name: 'B', domain: 'nordwind.de' }),
    );

    await service.nachtraeglichZuordnen(workspaceId, { companyId: a.id });
    expect((await gespeichert('Alt'))[0].companyId).toBeNull();

    await service.nachtraeglichZuordnen(workspaceId);
    expect((await gespeichert('Alt'))[0].companyId).toBe(b.id);
  });
});
