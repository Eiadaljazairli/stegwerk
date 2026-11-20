import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { type BillingService } from '../billing/billing.service';
import { ContactsService } from '../crm/contacts.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { readKey, seal } from '../mailboxes/secret-box';
import {
  type MailSender,
  VersandFehlgeschlagen,
  type Versandauftrag,
  type Versandzugang,
} from '../mailboxes/smtp-sender';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { abmeldeToken, leseAbmeldeToken } from './abmelde-token';
import {
  AbmeldungEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from './serienmail.entities';
import { fuelle, JE_MINUTE, SerienmailsService } from './serienmails.service';

const SUITE = 'd2_serienmails';
const GEHEIMNIS = 'test-geheimnis-mindestens-zweiunddreissig-zeichen';
const SCHLUESSEL = randomBytes(32).toString('base64');

jest.setTimeout(60_000);

class Mitschrift implements MailSender {
  gesendet: Versandauftrag[] = [];

  async send(_zugang: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    this.gesendet.push(auftrag);

    return Promise.resolve();
  }
}

let dataSource: DataSource;
let service: SerienmailsService;
let sender: Mitschrift;
let workspaceId: string;
let ichId: string;

const ich = (): RequestUser => ({
  userId: ichId,
  workspaceId,
  email: 'ich@wir.de',
});

const kontakt = (felder: Partial<ContactEntity>) =>
  dataSource.getRepository(ContactEntity).save(
    dataSource.getRepository(ContactEntity).create({
      workspaceId,
      firstName: 'Anna',
      lastName: 'Alt',
      email: null,
      ...felder,
    }),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  sender = new Mitschrift();

  const config = {
    get: (schluessel: string) =>
      schluessel === 'mailEncryptionKey' ? SCHLUESSEL : undefined,
    getOrThrow: (schluessel: string) =>
      ({
        jwtSecret: GEHEIMNIS,
        webOrigin: 'https://crm.example.de',
      })[schluessel],
  } as unknown as ConfigService;

  service = new SerienmailsService(
    dataSource.getRepository(KampagneEntity),
    dataSource.getRepository(KampagnenEmpfaengerEntity),
    dataSource.getRepository(AbmeldungEntity),
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailSperreEntity),
    dataSource.getRepository(SavedViewEntity),
    new ContactsService(
      dataSource.getRepository(ContactEntity),
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    ),
    { assertCanWrite: async () => {} } as unknown as BillingService,
    sender,
    config,
    dataSource,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  sender.gesendet = [];
  await dataSource.query(
    'TRUNCATE TABLE kampagnen, abmeldungen, mail_sperren, mailboxes, contacts, companies, workspaces, users CASCADE',
  );

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Wir GmbH', slug: 'wir' })
  ).id;
  ichId = (
    await dataSource.getRepository(UserEntity).save({
      email: 'ich@wir.de',
      passwordHash: 'x',
      firstName: 'Ina',
      lastName: 'Ich',
    })
  ).id;
  await dataSource.getRepository(MailboxEntity).save({
    workspaceId,
    userId: ichId,
    host: 'imap.wir.de',
    username: 'ich@wir.de',
    passwordSealed: seal('geheim', readKey(SCHLUESSEL)),
    smtpHost: 'smtp.wir.de',
    smtpPort: 587,
  });
});

const kampagneMit = async (kontaktIds: string[]) => {
  const k = await service.anlegen(ich(), {
    name: 'Herbstgruß',
    betreff: 'Hallo {{vorname}}',
    text: 'Liebe/r {{vorname}} {{nachname}} von {{firma}},\nviele Grüße',
  });

  return service.empfaengerFestlegen(ich(), k.id, { kontaktIds });
};

describe('Platzhalter', () => {
  it('ersetzt die drei und lässt Unbekanntes stehen', () => {
    expect(
      fuelle('{{ Vorname }} {{nachname}}, {{firma}} {{plz}}', {
        vorname: 'Anna',
        nachname: 'Alt',
        firma: 'Nordwind',
      }),
    ).toBe('Anna Alt, Nordwind {{plz}}');
  });

  it('setzt den Ersatz ein, wo der Wert fehlt', () => {
    const daten = { vorname: '', nachname: 'Alt', firma: 'Nordwind' };

    expect(fuelle('Hallo {{vorname|zusammen}}!', daten)).toBe(
      'Hallo zusammen!',
    );
    expect(fuelle('{{nachname|Kunde}}', daten)).toBe('Alt');
  });
});

describe('wer nichts bekommt', () => {
  it('nennt für jeden Ausschluss den Grund', async () => {
    const firma = await dataSource
      .getRepository(CompanyEntity)
      .save({ workspaceId, name: 'Nordwind' });
    const gut = await kontakt({
      email: 'anna@nordwind.de',
      companyId: firma.id,
    });
    const ohne = await kontakt({ email: null });
    const kaputt = await kontakt({
      email: 'weg@alt.de',
      unzustellbarSeit: new Date(),
    });
    const ab = await kontakt({ email: 'nein@kunde.de' });
    const gesperrt = await kontakt({ email: 'x@werbung.de' });
    const doppelt = await kontakt({ email: 'ANNA@nordwind.de' });

    await dataSource
      .getRepository(AbmeldungEntity)
      .save({ workspaceId, email: 'nein@kunde.de', thema: 'alle' });
    await dataSource
      .getRepository(MailSperreEntity)
      .save({ workspaceId, eintrag: '@werbung.de' });

    const k = await kampagneMit([
      gut.id,
      ohne.id,
      kaputt.id,
      ab.id,
      gesperrt.id,
      doppelt.id,
    ]);
    const zeilen = await service.empfaengerListe(workspaceId, k.id, null);
    const grund = (id: string) =>
      zeilen.find((z) => z.contactId === id)?.grund ?? null;

    expect(k.geplant).toBe(1);
    expect(k.uebersprungen).toBe(5);
    expect(zeilen.find((z) => z.contactId === gut.id)?.firma).toBe('Nordwind');
    expect(grund(ohne.id)).toBe('Keine E-Mail-Adresse');
    expect(grund(kaputt.id)).toBe('Adresse ist als unzustellbar markiert');
    expect(grund(ab.id)).toBe('Hat sich abgemeldet');
    expect(grund(gesperrt.id)).toBe('Steht auf der Sperrliste');
    expect(grund(doppelt.id)).toBe('Adresse kommt doppelt vor');
  });
});

describe('Versand', () => {
  it('füllt die Platzhalter und setzt die Abmelde-Kopfzeilen', async () => {
    const anna = await kontakt({ email: 'anna@nordwind.de' });
    const k = await kampagneMit([anna.id]);

    await service.starten(ich(), k.id);
    expect(await service.runde()).toBe(1);

    const [mail] = sender.gesendet;

    expect(mail.betreff).toBe('Hallo Anna');
    expect(mail.rumpf).toContain('Liebe/r Anna Alt von ,');
    expect(mail.rumpf).toContain('https://crm.example.de/abmelden/');
    expect(mail.kopfzeilen?.['List-Unsubscribe']).toMatch(
      /^<https:\/\/crm\.example\.de\/public\/abmelden\/.+>$/u,
    );
    expect(mail.kopfzeilen?.['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );

    await service.runde();
    expect((await service.eine(workspaceId, k.id)).status).toBe('fertig');
  });

  it('schickt nie mehr als JE_MINUTE je Runde', async () => {
    const ids: string[] = [];

    for (let i = 0; i < JE_MINUTE + 5; i += 1) {
      ids.push((await kontakt({ email: `k${String(i)}@kunde.de` })).id);
    }

    const k = await kampagneMit(ids);

    await service.starten(ich(), k.id);

    expect(await service.runde()).toBe(JE_MINUTE);
    expect(sender.gesendet).toHaveLength(JE_MINUTE);
    expect((await service.eine(workspaceId, k.id)).geplant).toBe(5);
  });

  it('lässt aus, wer sich zwischen Start und Versand abmeldet', async () => {
    const anna = await kontakt({ email: 'anna@nordwind.de' });
    const k = await kampagneMit([anna.id]);

    await service.starten(ich(), k.id);
    await service.abmelden(
      { workspaceId, email: 'anna@nordwind.de', thema: 'allgemein' },
      false,
    );
    await service.runde();

    expect(sender.gesendet).toHaveLength(0);

    const [zeile] = await service.empfaengerListe(workspaceId, k.id, null);

    expect(zeile.status).toBe('uebersprungen');
  });
});

describe('Versand, der unterbrochen wird', () => {
  const zeilen = (kampagneId: string) =>
    dataSource
      .getRepository(KampagnenEmpfaengerEntity)
      .find({ where: { kampagneId }, order: { email: 'ASC' } });

  it('hält bei einem Fehler am Postfach an, statt die Liste zu verbrennen', async () => {
    const ids = [
      (await kontakt({ email: 'a@kunde.de' })).id,
      (await kontakt({ email: 'b@kunde.de' })).id,
      (await kontakt({ email: 'c@kunde.de' })).id,
    ];
    const k = await kampagneMit(ids);

    await service.starten(ich(), k.id);

    const echt = sender.send.bind(sender);

    sender.send = () =>
      Promise.reject(
        new VersandFehlgeschlagen(
          'Der Mailserver hat die Anmeldedaten des Postfachs abgelehnt.',
          true,
        ),
      );
    await service.runde();

    const danach = await zeilen(k.id);

    expect(danach.map((z) => z.status)).toEqual([
      'geplant',
      'geplant',
      'geplant',
    ]);
    expect(danach[0].grund).toMatch(/^Wartet: .*Anmeldedaten/u);
    expect((await service.eine(workspaceId, k.id)).status).toBe('laeuft');

    sender.send = echt;
    await service.runde();
    expect(sender.gesendet.map((m) => m.an[0]).sort()).toEqual([
      'a@kunde.de',
      'b@kunde.de',
      'c@kunde.de',
    ]);
    expect((await zeilen(k.id)).every((z) => z.grund === null)).toBe(true);
  });

  it('vermerkt eine abgelehnte Adresse und schickt den Rest', async () => {
    const ids = [
      (await kontakt({ email: 'a@kunde.de' })).id,
      (await kontakt({ email: 'b@kunde.de' })).id,
    ];
    const k = await kampagneMit(ids);

    await service.starten(ich(), k.id);

    const echt = sender.send.bind(sender);

    sender.send = (zugang, auftrag) =>
      auftrag.an[0] === 'a@kunde.de'
        ? Promise.reject(
            new VersandFehlgeschlagen(
              'Der Mailserver hat die Nachricht abgelehnt (550).',
            ),
          )
        : echt(zugang, auftrag);
    await service.runde();
    sender.send = echt;

    const [a, b] = await zeilen(k.id);

    expect(a.status).toBe('fehler');
    expect(a.gesendetAm).toBeNull();
    expect(b.status).toBe('gesendet');
  });

  it('schickt nach einem Neustart nichts doppelt und nichts Angefangenes noch einmal', async () => {
    const ids = [
      (await kontakt({ email: 'a@kunde.de' })).id,
      (await kontakt({ email: 'b@kunde.de' })).id,
      (await kontakt({ email: 'c@kunde.de' })).id,
    ];
    const k = await kampagneMit(ids);

    await service.starten(ich(), k.id);

    const repo = dataSource.getRepository(KampagnenEmpfaengerEntity);
    const [a, b] = await zeilen(k.id);
    const jetzt = new Date();

    await repo.update(a.id, {
      status: 'sendet',
      gesendetAm: new Date(jetzt.getTime() - 30 * 60 * 1000),
    });
    await repo.update(b.id, { status: 'sendet' });

    await service.haengendeAufloesen(jetzt, true);
    await service.runde(jetzt);

    const danach = await zeilen(k.id);

    expect(danach.map((z) => z.status)).toEqual([
      'fehler',
      'gesendet',
      'gesendet',
    ]);
    expect(danach[0].grund).toMatch(/unklar/u);
    expect(sender.gesendet.map((m) => m.an[0]).sort()).toEqual([
      'b@kunde.de',
      'c@kunde.de',
    ]);

    await service.runde(jetzt);
    expect((await service.eine(workspaceId, k.id)).status).toBe('fertig');
  });
});

describe('der Abmeldelink', () => {
  it('trägt Bereich, Adresse und Thema und ist nicht zu fälschen', () => {
    const token = abmeldeToken(
      { workspaceId: 'ws', email: 'a@b.de', thema: 'allgemein' },
      GEHEIMNIS,
    );

    expect(leseAbmeldeToken(token, GEHEIMNIS)).toEqual({
      workspaceId: 'ws',
      email: 'a@b.de',
      thema: 'allgemein',
    });
    expect(leseAbmeldeToken(token, 'anderes-geheimnis')).toBeNull();

    const [nutzlast, sig] = token.split('.');
    const fremd = Buffer.from(
      JSON.stringify(['ws', 'fremd@b.de', 'allgemein']),
    ).toString('base64url');

    expect(leseAbmeldeToken(`${fremd}.${sig}`, GEHEIMNIS)).toBeNull();
    expect(nutzlast).not.toBe(fremd);
  });

  it('wirkt für das Thema; „alles“ auch für andere', async () => {
    await service.abmelden(
      { workspaceId, email: 'Anna@Nordwind.de', thema: 'newsletter' },
      false,
    );

    const anna = await kontakt({ email: 'anna@nordwind.de' });
    const k = await kampagneMit([anna.id]);

    expect(k.geplant).toBe(1);

    await service.abmelden(
      { workspaceId, email: 'anna@nordwind.de', thema: 'newsletter' },
      true,
    );

    const neu = await service.empfaengerFestlegen(ich(), k.id, {
      kontaktIds: [anna.id],
    });

    expect(neu.geplant).toBe(0);
  });
});

describe('Abmeldungen im Überblick', () => {
  it('listet sie mit Suche und schlägt vorhandene Themen vor', async () => {
    await service.abmelden(
      { workspaceId, email: 'bert@sued.de', thema: 'messe' },
      false,
    );
    await service.abmelden(
      { workspaceId, email: 'carla@nord.de', thema: 'messe' },
      true,
    );

    const alle = await service.abmeldungsListe(workspaceId);

    expect(alle.map((a) => a.email)).toEqual(
      expect.arrayContaining(['bert@sued.de', 'carla@nord.de']),
    );
    expect(
      (await service.abmeldungsListe(workspaceId, 'SUED')).map((a) => a.email),
    ).toEqual(['bert@sued.de']);
    expect(await service.abmeldungsListe(workspaceId, '%')).toEqual([]);

    const themen = await service.themen(workspaceId);

    expect(themen).toContain('messe');
    expect(themen).not.toContain('alle');
  });
});
