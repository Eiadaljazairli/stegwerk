import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AttendeeStatus } from '../calendar/attendees';
import { buildIcs } from '../calendar/ics';
import { asEvent } from '../calendar/ics-export.service';
import { liesIcs } from '../calendar/ics-lesen';
import { TerminBeobachter } from '../calendar/termin-beobachter';
import {
  BELEGT,
  fuerBetrachter,
  sichtregelLaden,
} from '../calendar/termin-sichtbarkeit';
import {
  hoereTermin,
  type TerminEreignis,
} from '../calendar/termin-ereignisse';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { teilnehmerZuordnen } from '../calendar/teilnehmer-zuordnung';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import {
  type IncomingMessage,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from '../mailboxes/imap-reader';
import { MailMessageEntity } from '../mailboxes/mail-message.entity';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import {
  type MailSender,
  mailOptionen,
  type Versandauftrag,
  type Versandzugang,
} from '../mailboxes/smtp-sender';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { UngueltigesZiel } from '../webhooks/webhook-ziel';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  CalDavClient,
  type HttpAnfrage,
  type HttpAntwort,
  pruefeKalenderUrl,
} from './caldav-client';
import { KalenderEintragEntity } from './kalender-eintrag.entity';
import { KalenderSyncService } from './kalender-sync.service';
import { KalenderVerbindungEntity } from './kalender-verbindung.entity';

const SUITE = 'kalender_sync';
const KEY = randomBytes(32).toString('base64');
const HOST = 'app.stegwerk.test';
const DAV = 'https://dav.example.de';
const KALENDER = `${DAV}/calendars/ich/arbeit/`;

jest.setTimeout(60_000);

type Datei = { etag: string; ics: string };

class FakeDav {
  dateien = new Map<string, Datei>();
  anfragen: HttpAnfrage[] = [];
  kaputt: string | null = null;
  private zaehler = 0;

  neuesEtag(): string {
    this.zaehler += 1;

    return `"e${String(this.zaehler)}"`;
  }

  legen(pfad: string, ics: string): string {
    const etag = this.neuesEtag();

    this.dateien.set(`${DAV}${pfad}`, { etag, ics });

    return etag;
  }

  von(methode: string): HttpAnfrage[] {
    return this.anfragen.filter((anfrage) => anfrage.methode === methode);
  }

  private multi(antworten: string[]): HttpAntwort {
    return {
      status: 207,
      kopf: { 'content-type': 'application/xml' },
      rumpf: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${antworten.join('')}</d:multistatus>`,
    };
  }

  transport = (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    this.anfragen.push(anfrage);

    const url = anfrage.url.toString();
    const pfad = anfrage.url.pathname;

    if (anfrage.methode === this.kaputt) {
      return Promise.resolve({ status: 500, kopf: {}, rumpf: '' });
    }

    if (
      anfrage.kopf.authorization !==
      `Basic ${Buffer.from('ich@wir.de:app-pw').toString('base64')}`
    ) {
      return Promise.resolve({ status: 401, kopf: {}, rumpf: '' });
    }

    if (anfrage.methode === 'PROPFIND') {
      if (pfad === '/' || pfad === '/.well-known/caldav') {
        return Promise.resolve(
          this.multi([
            '<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/principals/ich/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
          ]),
        );
      }

      if (pfad === '/principals/ich/') {
        return Promise.resolve(
          this.multi([
            '<d:response><d:href>/principals/ich/</d:href><d:propstat><d:prop><cal:calendar-home-set><d:href>/calendars/ich/</d:href></cal:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
          ]),
        );
      }

      if (pfad === '/calendars/ich/') {
        return Promise.resolve(
          this.multi([
            '<d:response><d:href>/calendars/ich/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            '<d:response><d:href>/calendars/ich/arbeit/</d:href><d:propstat><d:prop><d:displayname>Arbeit &amp; Büro</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
            '<d:response><d:href>/calendars/ich/aufgaben/</d:href><d:propstat><d:prop><d:displayname>Aufgaben</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
          ]),
        );
      }

      return Promise.resolve({ status: 404, kopf: {}, rumpf: '' });
    }

    if (anfrage.methode === 'REPORT') {
      return Promise.resolve(
        this.multi(
          [...this.dateien.entries()]
            .filter(([href]) => href.startsWith(url))
            .map(
              ([href, datei]) =>
                `<d:response><d:href>${new URL(href).pathname}</d:href><d:propstat><d:prop><d:getetag>${datei.etag.replace(/"/g, '&quot;')}</d:getetag><cal:calendar-data>${datei.ics.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
            ),
        ),
      );
    }

    const vorhanden = this.dateien.get(url);

    if (anfrage.methode === 'PUT') {
      const ifMatch = anfrage.kopf['if-match'];
      const ifNoneMatch = anfrage.kopf['if-none-match'];

      if (
        (ifMatch !== undefined && vorhanden?.etag !== ifMatch) ||
        (ifNoneMatch === '*' && vorhanden !== undefined)
      ) {
        return Promise.resolve({ status: 412, kopf: {}, rumpf: '' });
      }

      const etag = this.neuesEtag();

      this.dateien.set(url, { etag, ics: anfrage.rumpf ?? '' });

      return Promise.resolve({
        status: vorhanden === undefined ? 201 : 204,
        kopf: { etag },
        rumpf: '',
      });
    }

    if (anfrage.methode === 'DELETE') {
      const gab = this.dateien.delete(url);

      return Promise.resolve({ status: gab ? 204 : 404, kopf: {}, rumpf: '' });
    }

    if (anfrage.methode === 'GET') {
      return Promise.resolve<HttpAntwort>(
        vorhanden === undefined
          ? { status: 404, kopf: {}, rumpf: '' }
          : {
              status: 200,
              kopf: { etag: vorhanden.etag },
              rumpf: vorhanden.ics,
            },
      );
    }

    return Promise.resolve({ status: 405, kopf: {}, rumpf: '' });
  };
}

class FakeReader implements MailReader {
  messages: IncomingMessage[] = [];

  check(): Promise<void> {
    return Promise.resolve();
  }

  read(_: unknown, options: ReadOptions): Promise<ReadResult> {
    return Promise.resolve({
      uidValidity: 7,
      messages: this.messages.filter((m) => m.uid > options.afterUid),
    });
  }
}

class FakeSender implements MailSender {
  auftraege: Versandauftrag[] = [];

  send(_: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    this.auftraege.push(auftrag);

    return Promise.resolve();
  }
}

const fremdeDatei = (
  uid: string,
  titel: string,
  geaendert: string,
  zusatz: string[] = [],
): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${geaendert}`,
    `LAST-MODIFIED:${geaendert}`,
    'DTSTART;TZID=Europe/Berlin:20261105T100000',
    'DTEND;TZID=Europe/Berlin:20261105T113000',
    `SUMMARY:${titel}`,
    'LOCATION:Hamburg\\, Hafen',
    ...zusatz,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

let dataSource: DataSource;
let dav: FakeDav;
let reader: FakeReader;
let sender: FakeSender;
let mailboxes: MailboxesService;
let service: KalenderSyncService;
let workspaceId: string;
let userId: string;
let ich: RequestUser;
let annaId: string;
let nordwindId: string;

const config = {
  get: (schluessel: string) =>
    schluessel === 'webOrigin' ? `https://${HOST}` : KEY,
} as unknown as ConfigService;

const termine = () => dataSource.getRepository(AppointmentEntity);
const eintraege = () => dataSource.getRepository(KalenderEintragEntity);
const verbindungen = () => dataSource.getRepository(KalenderVerbindungEntity);
const runde = () => dataSource.getRepository(AppointmentAttendeeEntity);

const bis = async (
  bedingung: () => Promise<boolean> | boolean,
): Promise<void> => {
  for (let versuch = 0; versuch < 60; versuch += 1) {
    if (await bedingung()) {
      return;
    }

    await new Promise((fertig) => setTimeout(fertig, 100));
  }

  throw new Error('Bedingung nicht erreicht.');
};

const verbinden = async (): Promise<KalenderVerbindungEntity> => {
  const { verbindung } = await service.verbinden(ich, {
    serverUrl: `${DAV}/`,
    benutzer: 'ich@wir.de',
    passwort: 'app-pw',
  });

  await bis(
    async () =>
      (await verbindungen().findOneByOrFail({ id: verbindung.id }))
        .letzterSyncAm !== null,
  );

  return verbindungen().findOneByOrFail({ id: verbindung.id });
};

const termin = (titel: string, start = '2026-11-02T09:00:00Z') =>
  termine().create({
    workspaceId,
    ownerId: userId,
    createdById: userId,
    title: titel,
    description: null,
    location: null,
    startsAt: new Date(start),
    endsAt: new Date(new Date(start).getTime() + 3_600_000),
    allDay: false,
    remindMinutesBefore: null,
    remindedAt: null,
    recurrence: null,
    skippedDates: [],
    companyId: null,
    contactId: null,
    dealId: null,
  });

const postfachVerbinden = async (): Promise<void> => {
  await mailboxes.connect(workspaceId, userId, {
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

const JETZT = new Date('2026-10-20T08:00:00Z');

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  new TerminBeobachter(dataSource);
  reader = new FakeReader();
  sender = new FakeSender();
  mailboxes = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    sender,
    config,
    dataSource.getRepository(MailSperreEntity),
    dataSource,
  );
  dav = new FakeDav();
  service = new KalenderSyncService(
    verbindungen(),
    eintraege(),
    termine(),
    runde(),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(UserEntity),
    mailboxes,
    config,
    dav.transport,
  );
  service.onModuleInit();
});

afterAll(async () => {
  service.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await new Promise((fertig) => setTimeout(fertig, 500));
  await dataSource.query(
    'TRUNCATE TABLE kalender_eintraege, kalender_verbindungen, appointment_attendees, appointments, mail_messages, mailboxes, contacts, companies, workspaces, users CASCADE',
  );

  dav.dateien.clear();
  dav.anfragen = [];
  dav.kaputt = null;
  reader.messages = [];
  sender.auftraege = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
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
  ich = { userId, workspaceId, email: 'ich@wir.de' } as RequestUser;
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
        email: 'Anna@Nordwind.de',
        companyId: nordwindId,
      }),
    )
  ).id;
});

describe('ICS lesen', () => {
  it('liest Zeitzone, Faltung, Escapes und Teilnehmer', () => {
    const datei = liesIcs(
      [
        'BEGIN:VCALENDAR',
        'METHOD:REPLY',
        'BEGIN:VEVENT',
        'UID:abc@x.de',
        'DTSTART;TZID=W. Europe Standard Time:20260715T140000',
        'DURATION:PT90M',
        'SUMMARY:Lange Zeile mit\\, Komma und',
        '  Fortsetzung',
        'ATTENDEE;CN="Schmidt, Anna";PARTSTAT=ACCEPTED:mailto:Anna@Nordwind.de',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );
    const [eintrag] = datei.termine;

    expect(datei.methode).toBe('REPLY');
    expect(eintrag.startsAt.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(eintrag.endsAt.toISOString()).toBe('2026-07-15T13:30:00.000Z');
    expect(eintrag.titel).toBe('Lange Zeile mit, Komma und Fortsetzung');
    expect(eintrag.teilnehmer).toEqual([
      {
        email: 'anna@nordwind.de',
        name: 'Schmidt, Anna',
        partstat: 'ACCEPTED',
      },
    ]);
  });

  it('nimmt ganztägige Termine als Tage', () => {
    const [eintrag] = liesIcs(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:tag@x.de',
        'DTSTART;VALUE=DATE:20261224',
        'DTEND;VALUE=DATE:20261225',
        'SUMMARY:Heiligabend',
        'RRULE:FREQ=YEARLY',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n'),
    ).termine;

    expect(eintrag.ganztaegig).toBe(true);
    expect(eintrag.regel).toBe('FREQ=YEARLY');
  });
});

describe('SSRF', () => {
  it('weist interne Adressen und http ab', () => {
    for (const adresse of [
      'https://127.0.0.1/',
      'https://localhost/dav',
      'https://169.254.169.254/latest',
      'https://[::1]/',
      'https://10.0.0.5/',
      'https://nas.local/',
      'http://dav.example.de/',
      'https://ich:pw@dav.example.de/',
    ]) {
      expect(() => pruefeKalenderUrl(adresse, false)).toThrow(UngueltigesZiel);
    }

    expect(pruefeKalenderUrl('https://dav.example.de/', false).hostname).toBe(
      'dav.example.de',
    );
  });

  it('folgt keiner Weiterleitung ins interne Netz', async () => {
    const angefragt: string[] = [];
    const client = new CalDavClient(
      (anfrage) => {
        angefragt.push(anfrage.url.toString());

        return Promise.resolve({
          status: 301,
          kopf: { location: 'https://169.254.169.254/' },
          rumpf: '',
        });
      },
      'ich',
      'pw',
      false,
    );

    await expect(client.entdecken('https://dav.example.de/')).rejects.toThrow(
      UngueltigesZiel,
    );
    expect(angefragt).toEqual(['https://dav.example.de/']);
  });
});

describe('Verbinden', () => {
  it('findet den Kalender über Principal und Heimat, das Passwort versiegelt', async () => {
    const { kalender, verbindung } = await service.verbinden(ich, {
      serverUrl: `${DAV}/`,
      benutzer: 'ich@wir.de',
      passwort: 'app-pw',
    });

    expect(kalender).toEqual([{ url: KALENDER, name: 'Arbeit & Büro' }]);
    expect(verbindung.kalenderUrl).toBe(KALENDER);

    const zeile = await verbindungen().findOneByOrFail({ id: verbindung.id });

    expect(zeile.passwortVersiegelt).not.toContain('app-pw');
    await bis(
      async () =>
        (await verbindungen().findOneByOrFail({ id: verbindung.id }))
          .letzterSyncAm !== null,
    );
  });

  it('weist ein falsches Passwort ab und speichert nichts', async () => {
    await expect(
      service.verbinden(ich, {
        serverUrl: `${DAV}/`,
        benutzer: 'ich@wir.de',
        passwort: 'falsch',
      }),
    ).rejects.toThrow(/Anmeldung abgelehnt/);
    expect(await verbindungen().count()).toBe(0);
  });
});

describe('Stegwerk → Kalender', () => {
  it('legt einen neuen Termin per PUT mit UID ab', async () => {
    await verbinden();
    dav.anfragen = [];

    const neu = await termine().save(termin('Abstimmung Nordwind'));

    await bis(() => dav.von('PUT').length > 0);

    const [put] = dav.von('PUT');

    expect(put.url.toString()).toBe(`${KALENDER}${neu.id}.ics`);
    expect(put.kopf['if-none-match']).toBe('*');
    expect(put.kopf['content-type']).toBe('text/calendar; charset=utf-8');
    expect(put.rumpf).toContain(`UID:${neu.id}@${HOST}`);
    expect(put.rumpf).not.toContain('METHOD:');

    await bis(async () => (await eintraege().count()) === 1);

    const eintrag = await eintraege().findOneByOrFail({
      appointmentId: neu.id,
    });

    expect(eintrag.etag).toBe(dav.dateien.get(put.url.toString())?.etag);
  });

  it('schickt eine Änderung mit If-Match, eine Löschung als DELETE', async () => {
    await verbinden();

    const neu = await termine().save(termin('Abstimmung'));

    await bis(async () => (await eintraege().count()) === 1);

    const href = `${KALENDER}${neu.id}.ics`;
    const etag = dav.dateien.get(href)?.etag;

    dav.anfragen = [];
    neu.title = 'Abstimmung verschoben';
    await termine().save(neu);
    await bis(() => dav.von('PUT').length > 0);

    expect(dav.von('PUT')[0].kopf['if-match']).toBe(etag);
    await bis(() => dav.dateien.get(href)?.ics.includes('verschoben') === true);

    await termine().remove(neu);
    await bis(() => !dav.dateien.has(href));

    expect(dav.von('DELETE')).toHaveLength(1);
    await bis(async () => (await eintraege().count()) === 0);
  });

  it('reicht beim Abgleich nach, was noch nie hinüber ging', async () => {
    await termine().save(termin('Schon da'));
    await verbinden();

    expect(dav.von('PUT')).toHaveLength(1);
    expect(await eintraege().count()).toBe(1);
  });
});

describe('Kalender → Stegwerk', () => {
  it('übernimmt einen fremden Termin samt Kontakt und meldet ihn nicht zurück', async () => {
    const verbindung = await verbinden();
    dav.legen(
      '/calendars/ich/arbeit/fremd-1.ics',
      fremdeDatei('fremd-1@nextcloud', 'Besuch Nordwind', '20261019T080000Z', [
        'ORGANIZER:mailto:ich@wir.de',
        'ATTENDEE;PARTSTAT=ACCEPTED:mailto:ich@wir.de',
        'ATTENDEE;CN=Anna Schmidt;PARTSTAT=TENTATIVE:mailto:anna@nordwind.de',
      ]),
    );

    const ereignisse: TerminEreignis[] = [];
    const ab = hoereTermin((ereignis) => ereignisse.push(ereignis));

    dav.anfragen = [];

    const ergebnis = await service.abgleichen(verbindung, JETZT);

    ab();

    expect(ergebnis).toEqual({
      neu: 1,
      geaendert: 0,
      geloescht: 0,
      hochgeladen: 0,
    });
    expect(ereignisse).toEqual([]);
    expect(dav.von('PUT')).toHaveLength(0);

    const [neu] = await termine().find({ where: { workspaceId } });

    expect(neu.title).toBe('Besuch Nordwind');
    expect(neu.location).toBe('Hamburg, Hafen');
    expect(neu.quelle).toBe('kalender');
    expect(neu.startsAt.toISOString()).toBe('2026-11-05T09:00:00.000Z');
    expect(neu.contactId).toBe(annaId);

    const teilnehmer = await runde().find({ where: { appointmentId: neu.id } });

    expect(teilnehmer).toHaveLength(1);
    expect(teilnehmer[0].contactId).toBe(annaId);
    expect(teilnehmer[0].status).toBe(AttendeeStatus.TENTATIVE);

    await new Promise((fertig) => setTimeout(fertig, 600));
    expect(dav.von('PUT')).toHaveLength(0);
    expect(await service.abgleichen(verbindung, JETZT)).toEqual({
      neu: 0,
      geaendert: 0,
      geloescht: 0,
      hochgeladen: 0,
    });
    expect(dav.von('PUT')).toHaveLength(0);
  });

  it('übernimmt eine dort jüngere Änderung', async () => {
    const verbindung = await verbinden();
    const pfad = '/calendars/ich/arbeit/fremd-2.ics';

    dav.legen(
      pfad,
      fremdeDatei('fremd-2@nextcloud', 'Alt', '20261019T080000Z'),
    );
    await service.abgleichen(verbindung, JETZT);

    dav.legen(
      pfad,
      fremdeDatei('fremd-2@nextcloud', 'Neu', '20301019T080000Z'),
    );

    expect((await service.abgleichen(verbindung, JETZT)).geaendert).toBe(1);
    expect((await termine().findOneByOrFail({ workspaceId })).title).toBe(
      'Neu',
    );
  });

  it('löscht hier, was dort verschwunden ist', async () => {
    const verbindung = await verbinden();
    const pfad = '/calendars/ich/arbeit/fremd-3.ics';

    dav.legen(
      pfad,
      fremdeDatei('fremd-3@nextcloud', 'Weg damit', '20261019T080000Z'),
    );
    await service.abgleichen(verbindung, JETZT);
    expect(await termine().count()).toBe(1);

    dav.dateien.delete(`${DAV}${pfad}`);
    dav.anfragen = [];

    expect((await service.abgleichen(verbindung, JETZT)).geloescht).toBe(1);
    expect(await termine().count()).toBe(0);
    expect(await eintraege().count()).toBe(0);
    await new Promise((fertig) => setTimeout(fertig, 600));
    expect(dav.von('DELETE')).toHaveLength(0);
  });

  it('übernimmt keinen abgesagten Termin, den es hier nie gab', async () => {
    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/fremd-4.ics',
      fremdeDatei('fremd-4@nextcloud', 'Fällt aus', '20261019T080000Z', [
        'STATUS:CANCELLED',
      ]),
    );

    expect((await service.abgleichen(verbindung, JETZT)).neu).toBe(0);
  });

  it('merkt sich einen Fehler des Servers an der Verbindung', async () => {
    const verbindung = await verbinden();

    dav.kaputt = 'REPORT';

    await expect(service.abgleichen(verbindung, JETZT)).rejects.toThrow();
    expect(
      (await verbindungen().findOneByOrFail({ id: verbindung.id }))
        .letzterFehler,
    ).toMatch(/nicht abfragen \(500\)/);
  });
});

describe('Einladungen (iTIP)', () => {
  it('schickt REQUEST als text/calendar mit METHOD über das eigene Postfach', async () => {
    await postfachVerbinden();

    const neu = await termine().save(termin('Jahresgespräch'));

    await runde().save(
      runde().create({
        workspaceId,
        appointmentId: neu.id,
        contactId: annaId,
        userId: null,
        email: null,
        name: null,
      }),
    );

    const danach = await service.einladungSenden(ich, neu.id);

    expect(danach.eingeladenAm).not.toBeNull();
    expect(sender.auftraege).toHaveLength(1);

    const [auftrag] = sender.auftraege;

    expect(auftrag.an).toEqual(['anna@nordwind.de']);
    expect(auftrag.kalender?.methode).toBe('REQUEST');
    expect(auftrag.kalender?.inhalt).toContain('METHOD:REQUEST');
    expect(auftrag.kalender?.inhalt).toContain('ORGANIZER');
    expect(auftrag.kalender?.inhalt).toMatch(/ATTENDEE[^\n]*RSVP=TRUE/);

    const roh = await createTransport({ streamTransport: true, buffer: true })
      .sendMail(mailOptionen(auftrag))
      .then((info) => (info.message as Buffer).toString());

    expect(roh).toMatch(
      /Content-Type: text\/calendar; charset=utf-8;\s+method=REQUEST/i,
    );
    expect(roh).toMatch(/Content-Type: multipart\/alternative/i);

    const zweite = await service.einladungSenden(ich, neu.id);

    expect(zweite.sequenz).toBe(1);
    expect(sender.auftraege[1].kalender?.inhalt).toContain('SEQUENCE:1');
  });

  it('schickt bei einer Absage CANCEL an die Eingeladenen', async () => {
    await postfachVerbinden();

    const neu = await termine().save(termin('Wird abgesagt'));

    await runde().save(
      runde().create({
        workspaceId,
        appointmentId: neu.id,
        contactId: null,
        userId: null,
        email: 'gast@extern.de',
        name: 'Gast',
      }),
    );
    await service.einladungSenden(ich, neu.id);

    const geladen = await termine().findOneByOrFail({ id: neu.id });

    geladen.cancelledAt = new Date();
    await termine().save(geladen);
    await bis(() => sender.auftraege.length === 2);

    expect(sender.auftraege[1].kalender?.methode).toBe('CANCEL');
    expect(sender.auftraege[1].kalender?.inhalt).toContain('METHOD:CANCEL');
    expect(sender.auftraege[1].kalender?.inhalt).toContain('STATUS:CANCELLED');
  });

  it('verweigert Einladungen ohne Postausgang', async () => {
    const neu = await termine().save(termin('Ohne Postfach'));

    await expect(service.einladungSenden(ich, neu.id)).rejects.toThrow(/SMTP/);
  });

  it('trägt eine Antwort (REPLY) aus dem Posteingang am Teilnehmer ein', async () => {
    await postfachVerbinden();

    const neu = await termine().save(termin('Jahresgespräch'));
    const anna = await runde().save(
      runde().create({
        workspaceId,
        appointmentId: neu.id,
        contactId: annaId,
        userId: null,
        email: null,
        name: null,
      }),
    );
    const antwort = (
      von: string,
      uid: number,
      partstat: string,
    ): IncomingMessage => ({
      uid,
      messageId: `antwort-${String(uid)}@nordwind.de`,
      from: von,
      to: 'ich@wir.de',
      cc: null,
      subject: 'Angenommen: Jahresgespräch',
      sentAt: new Date('2026-10-20T09:00:00Z'),
      inReplyTo: null,
      references: null,
      text: 'Ich komme.',
      kalender: [
        'BEGIN:VCALENDAR',
        'METHOD:REPLY',
        'BEGIN:VEVENT',
        `UID:${neu.id}@${HOST}`,
        'DTSTAMP:20261020T090000Z',
        'DTSTART:20261102T090000Z',
        `ATTENDEE;PARTSTAT=${partstat}:mailto:anna@nordwind.de`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    });

    reader.messages = [antwort('Mallory <mallory@boese.de>', 1, 'DECLINED')];
    await mailboxes.sync(workspaceId, userId);
    await new Promise((fertig) => setTimeout(fertig, 300));
    expect((await runde().findOneByOrFail({ id: anna.id })).status).toBe(
      AttendeeStatus.NEEDS_ACTION,
    );

    reader.messages.push(
      antwort('Anna Schmidt <anna@nordwind.de>', 2, 'ACCEPTED'),
    );
    await mailboxes.sync(workspaceId, userId);
    await bis(
      async () =>
        (await runde().findOneByOrFail({ id: anna.id })).status ===
        AttendeeStatus.ACCEPTED,
    );
  });
});

describe('Serien mit einzeln geänderten Tagen', () => {
  const serie = () =>
    termine().create({
      ...termin('Jour fixe', '2026-11-02T09:00:00Z'),
      recurrence: 'FREQ=WEEKLY;COUNT=6',
    });

  it('legt Serie und Ausnahme in eine Datei, mit RECURRENCE-ID', async () => {
    await verbinden();

    const kopf = await termine().save(serie());

    await bis(async () => (await eintraege().count()) === 1);

    const href = `${KALENDER}${kopf.id}.ics`;

    dav.anfragen = [];
    kopf.skippedDates = ['2026-11-09', '2026-11-16'];
    await termine().save(kopf);
    await termine().save(
      termine().create({
        ...termin('Jour fixe (Raum B)', '2026-11-10T13:00:00Z'),
        serieId: kopf.id,
        serieDatum: '2026-11-16',
      }),
    );

    await bis(
      () => dav.dateien.get(href)?.ics.includes('RECURRENCE-ID') === true,
    );
    await new Promise((fertig) => setTimeout(fertig, 600));

    const ics = dav.dateien.get(href)?.ics ?? '';

    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261116T100000');
    expect(ics).toContain('EXDATE;TZID=Europe/Berlin:20261109T100000');
    expect(ics).not.toContain('EXDATE;TZID=Europe/Berlin:20261116T100000');
    expect(ics.match(new RegExp(`UID:${kopf.id}@${HOST}`, 'g'))).toHaveLength(
      2,
    );
    expect(dav.dateien.size).toBe(1);
    expect(await eintraege().count()).toBe(1);
  });

  it('nimmt eine gelöschte Ausnahme aus der Datei der Serie', async () => {
    await verbinden();

    const kopf = await termine().save({
      ...serie(),
      skippedDates: ['2026-11-16'],
    });
    const ausnahme = await termine().save(
      termine().create({
        ...termin('Verschoben', '2026-11-17T13:00:00Z'),
        serieId: kopf.id,
        serieDatum: '2026-11-16',
      }),
    );
    const href = `${KALENDER}${kopf.id}.ics`;

    await bis(
      () => dav.dateien.get(href)?.ics.includes('RECURRENCE-ID') === true,
    );

    await termine().remove(ausnahme);

    await bis(
      () => dav.dateien.get(href)?.ics.includes('RECURRENCE-ID') === false,
    );
    expect(dav.dateien.get(href)?.ics).toContain(
      'EXDATE;TZID=Europe/Berlin:20261116T100000',
    );
  });

  it('übernimmt EXDATE und Ausnahmen aus dem Kalender und räumt sie wieder ab', async () => {
    const verbindung = await verbinden();
    const pfad = '/calendars/ich/arbeit/serie-1.ics';
    const datei = (mitAusnahmen: boolean, geaendert: string) =>
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nextcloud//DE',
        'BEGIN:VEVENT',
        'UID:serie-1@nextcloud',
        `LAST-MODIFIED:${geaendert}`,
        'DTSTART;TZID=Europe/Berlin:20261102T100000',
        'DTEND;TZID=Europe/Berlin:20261102T110000',
        'RRULE:FREQ=WEEKLY;COUNT=6',
        'EXDATE;TZID=Europe/Berlin:20261109T100000',
        'SUMMARY:Teamrunde',
        'END:VEVENT',
        ...(mitAusnahmen
          ? [
              'BEGIN:VEVENT',
              'UID:serie-1@nextcloud',
              `LAST-MODIFIED:${geaendert}`,
              'RECURRENCE-ID;TZID=Europe/Berlin:20261116T100000',
              'DTSTART;TZID=Europe/Berlin:20261117T140000',
              'DTEND;TZID=Europe/Berlin:20261117T150000',
              'SUMMARY:Teamrunde (Dienstag)',
              'END:VEVENT',
              'BEGIN:VEVENT',
              'UID:serie-1@nextcloud',
              `LAST-MODIFIED:${geaendert}`,
              'RECURRENCE-ID;TZID=Europe/Berlin:20261123T100000',
              'DTSTART;TZID=Europe/Berlin:20261123T100000',
              'DTEND;TZID=Europe/Berlin:20261123T110000',
              'STATUS:CANCELLED',
              'SUMMARY:Teamrunde',
              'END:VEVENT',
            ]
          : []),
        'END:VCALENDAR',
        '',
      ].join('\r\n');

    dav.legen(pfad, datei(true, '20261019T080000Z'));

    expect((await service.abgleichen(verbindung, JETZT)).neu).toBe(1);

    const kopf = await termine().findOneByOrFail({
      workspaceId,
      recurrence: 'FREQ=WEEKLY;COUNT=6',
    });
    const ausnahmen = await termine().find({
      where: { serieId: kopf.id },
      order: { serieDatum: 'ASC' },
    });

    expect(kopf.skippedDates).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
    expect(
      ausnahmen.map((eintrag) => [
        eintrag.serieDatum,
        eintrag.title,
        eintrag.cancelledAt === null ? 'findet statt' : 'abgesagt',
        eintrag.startsAt.toISOString(),
      ]),
    ).toEqual([
      [
        '2026-11-16',
        'Teamrunde (Dienstag)',
        'findet statt',
        '2026-11-17T13:00:00.000Z',
      ],
      ['2026-11-23', 'Teamrunde', 'abgesagt', '2026-11-23T09:00:00.000Z'],
    ]);
    await new Promise((fertig) => setTimeout(fertig, 600));
    expect(dav.von('PUT')).toHaveLength(0);

    dav.legen(pfad, datei(false, '20301019T080000Z'));
    await service.abgleichen(verbindung, JETZT);

    expect(await termine().count({ where: { serieId: kopf.id } })).toBe(0);
    expect(
      (await termine().findOneByOrFail({ id: kopf.id })).skippedDates,
    ).toEqual(['2026-11-09']);
  });

  it('trägt eine Antwort auf einen einzelnen Tag an dessen Termin ein', async () => {
    const kopf = await termine().save(serie());
    const ausnahme = await termine().save(
      termine().create({
        ...termin('Verschoben', '2026-11-17T13:00:00Z'),
        serieId: kopf.id,
        serieDatum: '2026-11-16',
      }),
    );
    const anna = await runde().save(
      runde().create({
        workspaceId,
        appointmentId: ausnahme.id,
        contactId: annaId,
        userId: null,
        email: null,
        name: null,
      }),
    );

    expect(
      await service.antwortVerarbeiten({
        workspaceId,
        von: 'anna@nordwind.de',
        ics: [
          'BEGIN:VCALENDAR',
          'METHOD:REPLY',
          'BEGIN:VEVENT',
          `UID:${kopf.id}@${HOST}`,
          'RECURRENCE-ID;TZID=Europe/Berlin:20261116T100000',
          'DTSTART:20261117T130000Z',
          'ATTENDEE;PARTSTAT=DECLINED:mailto:anna@nordwind.de',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      }),
    ).toBe(1);
    expect((await runde().findOneByOrFail({ id: anna.id })).status).toBe(
      AttendeeStatus.DECLINED,
    );
  });
});

describe('Welle 4: privat, Zuordnung, robuster Abruf', () => {
  const geschaeft = (name: string, extra: Partial<DealEntity> = {}) =>
    dataSource.getRepository(DealEntity).save(
      dataSource.getRepository(DealEntity).create({
        workspaceId,
        name,
        stage: DealStage.PROPOSAL,
        ...extra,
      }),
    );

  it('übernimmt CLASS:PRIVATE als privat; neue Verbindungen stehen auf „belegt“', async () => {
    const verbindung = await verbinden();

    expect(verbindung.sichtbarkeit).toBe('belegt');

    dav.legen(
      '/calendars/ich/arbeit/arzt.ics',
      fremdeDatei('arzt@nextcloud', 'Zahnarzt', '20261019T080000Z', [
        'CLASS:PRIVATE',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const [neu] = await termine().find({ where: { workspaceId } });

    expect(neu.privat).toBe(true);
    expect(
      liesIcs(buildIcs([asEvent(neu, HOST)], { ohneMethode: true })).termine[0]
        .privat,
    ).toBe(true);
  });

  it('hängt einen Termin an das eine offene Geschäft seiner Leute', async () => {
    const deal = await geschaeft('Lagerhalle', { primaryContactId: annaId });

    await geschaeft('Altes', {
      primaryContactId: annaId,
      stage: DealStage.WON,
    });

    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/g1.ics',
      fremdeDatei('g1@nextcloud', 'Termin zur Halle', '20261019T080000Z', [
        'ATTENDEE:mailto:anna@nordwind.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const [neu] = await termine().find({ where: { workspaceId } });

    expect(neu.dealId).toBe(deal.id);
    expect(neu.contactId).toBeNull();
  });

  it('rät nicht bei zwei offenen Geschäften und bleibt beim Kontakt', async () => {
    await geschaeft('Eins', { primaryContactId: annaId });
    await geschaeft('Zwei', { companyId: nordwindId });

    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/g2.ics',
      fremdeDatei('g2@nextcloud', 'Unklar', '20261019T080000Z', [
        'ATTENDEE:mailto:anna@nordwind.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const [neu] = await termine().find({ where: { workspaceId } });

    expect(neu.dealId).toBeNull();
    expect(neu.contactId).toBe(annaId);
  });

  it('erkennt Kollegen als Kollegen, nicht als fremde Adresse', async () => {
    const kollege = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: 'Bea@wir.de',
        passwordHash: 'x',
        firstName: 'Bea',
        lastName: 'Kollegin',
      }),
    );
    const fremd = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: 'carl@anderswo.de',
        passwordHash: 'x',
        firstName: 'Carl',
        lastName: 'Fremd',
      }),
    );

    await dataSource.getRepository(MembershipEntity).save(
      dataSource.getRepository(MembershipEntity).create({
        userId: kollege.id,
        workspaceId,
        role: MembershipRole.MEMBER,
      }),
    );

    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/k.ics',
      fremdeDatei('k@nextcloud', 'Teamrunde', '20261019T080000Z', [
        'ATTENDEE:mailto:bea@wir.de',
        'ATTENDEE:mailto:carl@anderswo.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const [neu] = await termine().find({ where: { workspaceId } });
    const teilnehmer = await runde().find({ where: { appointmentId: neu.id } });

    expect(teilnehmer.map((t) => [t.userId, t.contactId, t.email])).toEqual(
      expect.arrayContaining([
        [kollege.id, null, null],
        [null, null, 'carl@anderswo.de'],
      ]),
    );
    expect(teilnehmer).toHaveLength(2);
    expect(fremd.id).not.toBe(kollege.id);
  });

  it('ordnet eine Adresse nachträglich dem neuen Kontakt zu', async () => {
    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/n.ics',
      fremdeDatei('n@nextcloud', 'Erstgespräch', '20261019T080000Z', [
        'ATTENDEE;CN=Neu:mailto:neu@kunde.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const kontakt = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Nina',
        lastName: 'Neu',
        email: 'Neu@Kunde.de',
      }),
    );

    expect(await teilnehmerZuordnen(dataSource.manager, workspaceId)).toBe(1);

    const [zeile] = await runde().find({ where: { workspaceId } });

    expect(zeile.contactId).toBe(kontakt.id);
    expect(zeile.email).toBeNull();
    expect(await teilnehmerZuordnen(dataSource.manager, workspaceId)).toBe(0);
  });

  it('behält bei der Zuordnung ohne Namen die Adresse, und der Kontakt lässt sich löschen', async () => {
    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/o.ics',
      fremdeDatei('o@nextcloud', 'Ohne Namen', '20261019T080000Z', [
        'ATTENDEE:mailto:neu@kunde.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    const kontakt = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Nina',
        lastName: 'Neu',
        email: 'neu@kunde.de',
      }),
    );

    expect(await teilnehmerZuordnen(dataSource.manager, workspaceId)).toBe(1);
    expect(
      (await runde().find({ where: { workspaceId } })).map((t) => [
        t.contactId,
        t.email,
        t.name,
      ]),
    ).toEqual([[kontakt.id, null, 'neu@kunde.de']]);

    await dataSource.getRepository(ContactEntity).delete({ id: kontakt.id });

    expect(
      (await runde().find({ where: { workspaceId } })).map((t) => [
        t.contactId,
        t.name,
      ]),
    ).toEqual([[null, 'neu@kunde.de']]);
  });

  it('schreibt beim Übernehmen eines bekannten Kontakts ohne Namen die Adresse mit', async () => {
    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/b.ics',
      fremdeDatei('b@nextcloud', 'Bekannt', '20261019T080000Z', [
        'ATTENDEE:mailto:anna@nordwind.de',
      ]),
    );
    await service.abgleichen(verbindung, JETZT);

    expect(
      (await runde().find({ where: { workspaceId } })).map((t) => [
        t.contactId,
        t.name,
      ]),
    ).toEqual([[annaId, 'anna@nordwind.de']]);
  });

  it('lässt übernommene Termine nach dem Trennen für das Team „belegt“', async () => {
    const verbindung = await verbinden();

    dav.legen(
      '/calendars/ich/arbeit/e.ics',
      fremdeDatei('e@nextcloud', 'Elternabend', '20261019T080000Z'),
    );
    await service.abgleichen(verbindung, JETZT);

    const fuerKollegen = async (): Promise<string[]> =>
      fuerBetrachter(
        await termine().find({ where: { workspaceId } }),
        await sichtregelLaden(dataSource.manager, workspaceId, null),
      ).map((t) => t.title);

    expect(await fuerKollegen()).toEqual([BELEGT]);

    await service.trennen(ich);

    expect(await verbindungen().countBy({ workspaceId })).toBe(0);
    expect(await fuerKollegen()).toEqual([BELEGT]);

    await verbinden();
    await service.sichtbarkeitSetzen(ich, 'alles');

    expect(await fuerKollegen()).not.toContain(BELEGT);
  });

  it('zählt Fehlversuche, wartet mit wachsendem Abstand und meldet einen Tag Stillstand einmal', async () => {
    const verbindung = await verbinden();

    dav.kaputt = 'REPORT';
    await expect(service.abgleichen(verbindung, JETZT)).rejects.toThrow();
    await expect(service.abgleichen(verbindung, JETZT)).rejects.toThrow();

    let stand = await verbindungen().findOneByOrFail({ id: verbindung.id });

    expect(stand.fehlversuche).toBe(2);
    expect(stand.fehlerSeit?.toISOString()).toBe(JETZT.toISOString());

    await verbindungen().update(
      { id: verbindung.id },
      { letzterVersuchAm: JETZT },
    );
    expect(await service.runde(new Date(JETZT.getTime() + 5 * 60_000))).toBe(0);

    const mails: { to: string; subject: string }[] = [];
    const mitMail = new KalenderSyncService(
      verbindungen(),
      eintraege(),
      termine(),
      runde(),
      dataSource.getRepository(ContactEntity),
      dataSource.getRepository(UserEntity),
      mailboxes,
      config,
      dav.transport,
      undefined,
      {
        send: (mail: { to: string; subject: string }) => {
          mails.push(mail);

          return Promise.resolve(true);
        },
      } as never,
    );
    const spaeter = new Date(JETZT.getTime() + 25 * 3_600_000);

    expect(await mitMail.stillstandMelden(spaeter)).toBe(1);
    expect(await mitMail.stillstandMelden(spaeter)).toBe(0);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('ich@wir.de');
    expect(mails[0].subject).toMatch(/Kalender/u);

    dav.kaputt = null;
    await service.abgleichen(verbindung, spaeter);
    stand = await verbindungen().findOneByOrFail({ id: verbindung.id });
    expect([stand.fehlversuche, stand.fehlerSeit, stand.fehlerMailAm]).toEqual([
      0,
      null,
      null,
    ]);
  });
});
