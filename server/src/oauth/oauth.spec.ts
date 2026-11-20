import { instantFromBerlin } from '../calendar/berlin-time';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { parseRule } from '../calendar/recurrence';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import {
  type HttpAnfrage,
  type HttpAntwort,
} from '../kalender-sync/caldav-client';
import { graphZuRegel, regelZuGraph } from '../kalender-sync/graph-kalender';
import { KalenderEintragEntity } from '../kalender-sync/kalender-eintrag.entity';
import { KalenderSyncService } from '../kalender-sync/kalender-sync.service';
import { KalenderVerbindungEntity } from '../kalender-sync/kalender-verbindung.entity';
import {
  type MailboxCredentials,
  type MailReader,
  type ReadResult,
} from '../mailboxes/imap-reader';
import { MailMessageEntity } from '../mailboxes/mail-message.entity';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import {
  type MailSender,
  type Versandauftrag,
  type Versandzugang,
} from '../mailboxes/smtp-sender';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { istErlaubterHost } from './oauth-anbieter';
import { OAuthController } from './oauth.controller';
import { OAuthVorgangEntity } from './oauth-vorgang.entity';
import { OAuthZugangEntity } from './oauth-zugang.entity';
import { OAUTH_COOKIE } from './oauth.resolver';
import {
  kontoAusIdToken,
  OAuthFehler,
  OAuthService,
  OAuthWiderrufen,
} from './oauth.service';

const SUITE = 'oauth_zugaenge';
const KEY = randomBytes(32).toString('base64');
const WEB = 'https://app.stegwerk.test';

jest.setTimeout(60_000);

const idToken = (inhalt: Record<string, unknown>): string =>
  [
    Buffer.from('{"alg":"none"}').toString('base64url'),
    Buffer.from(JSON.stringify(inhalt)).toString('base64url'),
    'x',
  ].join('.');

const json = (status: number, inhalt: unknown): HttpAntwort => ({
  status,
  kopf: { 'content-type': 'application/json' },
  rumpf: JSON.stringify(inhalt),
});

type GraphEreignis = Record<string, unknown> & {
  id: string;
  '@odata.etag': string;
  kalender: string;
};

class FakeAnbieter {
  anfragen: HttpAnfrage[] = [];
  codes = new Map<string, { challenge: string; konto: string }>();
  gueltig = new Set<string>();
  zaehler = 0;
  dav = new Map<string, { etag: string; ics: string }>();
  graph = new Map<string, GraphEreignis>();
  zugriffGueltig = new Set<string>();

  private neu(praefix: string): string {
    this.zaehler += 1;

    return `${praefix}${String(this.zaehler)}`;
  }

  anmelden(url: string, konto = 'ich@wir.de'): { state: string; code: string } {
    const adresse = new URL(url);
    const code = this.neu('code-');

    this.codes.set(code, {
      challenge: adresse.searchParams.get('code_challenge') ?? '',
      konto,
    });

    return { state: adresse.searchParams.get('state') ?? '', code };
  }

  private bearer(anfrage: HttpAnfrage): boolean {
    const wert = anfrage.kopf.authorization ?? '';

    return wert.startsWith('Bearer ') && this.zugriffGueltig.has(wert.slice(7));
  }

  private tokens(konto: string, mitErneuerung: boolean): HttpAntwort {
    const zugriff = this.neu('zugriff-');
    const erneuerung = this.neu('erneuerung-');

    this.zugriffGueltig.add(zugriff);

    if (mitErneuerung) {
      this.gueltig.add(erneuerung);
    }

    return json(200, {
      access_token: zugriff,
      expires_in: 3600,
      ...(mitErneuerung ? { refresh_token: erneuerung } : {}),
      id_token: idToken({ email: konto }),
    });
  }

  transport = (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    this.anfragen.push(anfrage);

    return Promise.resolve(this.antworten(anfrage));
  };

  private antworten(anfrage: HttpAnfrage): HttpAntwort {
    const { url } = anfrage;
    const pfad = url.pathname;

    if (pfad.endsWith('/token')) {
      const rumpf = new URLSearchParams(anfrage.rumpf ?? '');

      if (rumpf.get('client_secret') !== 'geheim') {
        return json(401, { error: 'invalid_client' });
      }

      if (rumpf.get('grant_type') === 'authorization_code') {
        const code = this.codes.get(rumpf.get('code') ?? '');
        const challenge = createHash('sha256')
          .update(rumpf.get('code_verifier') ?? '')
          .digest('base64url');

        if (code === undefined || code.challenge !== challenge) {
          return json(400, { error: 'invalid_grant' });
        }

        this.codes.delete(rumpf.get('code') ?? '');

        return this.tokens(code.konto, true);
      }

      const alt = rumpf.get('refresh_token') ?? '';

      if (!this.gueltig.has(alt)) {
        return json(400, { error: 'invalid_grant' });
      }

      this.gueltig.delete(alt);

      return this.tokens(
        'ich@wir.de',
        url.hostname === 'login.microsoftonline.com',
      );
    }

    if (pfad.endsWith('/revoke')) {
      this.gueltig.delete(
        new URLSearchParams(anfrage.rumpf ?? '').get('token') ?? '',
      );

      return json(200, {});
    }

    if (!this.bearer(anfrage)) {
      return json(401, { error: 'unauthorized' });
    }

    if (url.hostname === 'www.googleapis.com') {
      return json(200, {
        items: [
          { id: 'teamkalender', summary: 'Team', accessRole: 'writer' },
          { id: 'ich@wir.de', summary: 'Ich', primary: true },
        ],
      });
    }

    if (url.hostname === 'apidata.googleusercontent.com') {
      return this.caldav(anfrage);
    }

    return this.graphAntwort(anfrage);
  }

  private caldav(anfrage: HttpAnfrage): HttpAntwort {
    const schluessel = anfrage.url.toString();
    const vorhanden = this.dav.get(schluessel);

    if (anfrage.methode === 'PUT') {
      const etag = `"${this.neu('g')}"`;

      if (anfrage.kopf['if-none-match'] === '*' && vorhanden !== undefined) {
        return { status: 412, kopf: {}, rumpf: '' };
      }

      this.dav.set(schluessel, { etag, ics: anfrage.rumpf ?? '' });

      return { status: 201, kopf: { etag }, rumpf: '' };
    }

    if (anfrage.methode === 'REPORT') {
      const teile = [...this.dav.entries()]
        .filter(([href]) => href.startsWith(schluessel))
        .map(
          ([href, datei]) =>
            `<d:response><d:href>${new URL(href).pathname}</d:href><d:propstat><d:prop><d:getetag>${datei.etag}</d:getetag><c:calendar-data>${datei.ics
              .replace(/&/g, '&amp;')
              .replace(
                /</g,
                '&lt;',
              )}</c:calendar-data></d:prop></d:propstat></d:response>`,
        );

      return {
        status: 207,
        kopf: {},
        rumpf: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${teile.join('')}</d:multistatus>`,
      };
    }

    if (anfrage.methode === 'DELETE') {
      return {
        status: this.dav.delete(schluessel) ? 204 : 404,
        kopf: {},
        rumpf: '',
      };
    }

    return { status: 405, kopf: {}, rumpf: '' };
  }

  private graphAntwort(anfrage: HttpAnfrage): HttpAntwort {
    const pfad = anfrage.url.pathname;

    if (pfad === '/v1.0/me/calendars') {
      return json(200, {
        value: [
          { id: 'feiertage', name: 'Feiertage', canEdit: false },
          {
            id: 'AAA',
            name: 'Kalender',
            canEdit: true,
            isDefaultCalendar: true,
          },
        ],
      });
    }

    const sammlung = /^\/v1\.0\/me\/calendars\/([^/]+)\/events$/u.exec(pfad);

    if (sammlung !== null && anfrage.methode === 'POST') {
      const inhalt = JSON.parse(anfrage.rumpf ?? '{}') as Record<
        string,
        unknown
      >;
      const id = this.neu('ev');
      const ereignis: GraphEreignis = {
        ...inhalt,
        id,
        iCalUId: `ical-${id}`,
        '@odata.etag': `W/"${this.neu('m')}"`,
        lastModifiedDateTime: new Date().toISOString(),
        type: inhalt.recurrence === null ? 'singleInstance' : 'seriesMaster',
        kalender: sammlung[1],
      };

      this.graph.set(id, alsUtc(ereignis));

      return json(201, ereignis);
    }

    if (sammlung !== null) {
      const filter = anfrage.url.searchParams.get('$filter') ?? '';
      const typ = filter.includes('seriesMaster')
        ? 'seriesMaster'
        : 'singleInstance';

      return json(200, {
        value: [...this.graph.values()].filter(
          (ereignis) =>
            ereignis.kalender === sammlung[1] && ereignis.type === typ,
        ),
      });
    }

    const einzeln = /^\/v1\.0\/me\/events\/([^/]+)$/u.exec(pfad);
    const ereignis = einzeln === null ? undefined : this.graph.get(einzeln[1]);

    if (einzeln === null || ereignis === undefined) {
      return json(404, {});
    }

    if (anfrage.methode === 'DELETE') {
      this.graph.delete(ereignis.id);

      return { status: 204, kopf: {}, rumpf: '' };
    }

    if (anfrage.methode === 'PATCH') {
      const bedingung = anfrage.kopf['if-match'];

      if (bedingung !== undefined && bedingung !== ereignis['@odata.etag']) {
        return json(412, {});
      }

      Object.assign(ereignis, JSON.parse(anfrage.rumpf ?? '{}'), {
        '@odata.etag': `W/"${this.neu('m')}"`,
        lastModifiedDateTime: new Date().toISOString(),
      });
      alsUtc(ereignis);

      return json(200, ereignis);
    }

    return json(200, ereignis);
  }
}

function alsUtc(ereignis: GraphEreignis): GraphEreignis {
  for (const feld of ['start', 'end'] as const) {
    const zeit = (ereignis as Record<string, unknown>)[feld] as
      | { dateTime: string; timeZone: string }
      | undefined;

    if (zeit?.timeZone === 'Europe/Berlin' && ereignis.isAllDay !== true) {
      const [datum, uhr] = zeit.dateTime.split('T');

      (ereignis as Record<string, unknown>)[feld] = {
        dateTime: instantFromBerlin(datum, uhr.slice(0, 5))
          .toISOString()
          .slice(0, 19),
        timeZone: 'UTC',
      };
    }
  }

  return ereignis;
}

class FakeReader implements MailReader {
  geprueft: MailboxCredentials[] = [];
  gelesen: MailboxCredentials[] = [];

  check(credentials: MailboxCredentials): Promise<void> {
    this.geprueft.push(credentials);

    return Promise.resolve();
  }

  read(credentials: MailboxCredentials): Promise<ReadResult> {
    this.gelesen.push(credentials);

    return Promise.resolve({ uidValidity: 1, messages: [] });
  }
}

class FakeSender implements MailSender {
  zugaenge: Versandzugang[] = [];

  send(zugang: Versandzugang, _: Versandauftrag): Promise<void> {
    this.zugaenge.push(zugang);

    return Promise.resolve();
  }
}

class FakeAntwort {
  ziel = '';
  geloescht: string[] = [];

  clearCookie(name: string): void {
    this.geloescht.push(name);
  }

  redirect(_: number, ziel: string): void {
    this.ziel = ziel;
  }
}

let dataSource: DataSource;
let anbieter: FakeAnbieter;
let reader: FakeReader;
let sender: FakeSender;
let oauth: OAuthService;
let mailboxes: MailboxesService;
let kalender: KalenderSyncService;
let controller: OAuthController;
let workspaceId: string;
let userId: string;
let ich: RequestUser;
let einstellungen: Record<string, unknown>;

const config = {
  get: (schluessel: string) =>
    schluessel === 'webOrigin'
      ? WEB
      : schluessel === 'oauth'
        ? einstellungen
        : KEY,
} as unknown as ConfigService;

const zugaenge = () => dataSource.getRepository(OAuthZugangEntity);
const verbindungen = () => dataSource.getRepository(KalenderVerbindungEntity);
const eintraege = () => dataSource.getRepository(KalenderEintragEntity);
const termine = () => dataSource.getRepository(AppointmentEntity);

const bis = async (bedingung: () => Promise<boolean>): Promise<void> => {
  for (let versuch = 0; versuch < 60; versuch += 1) {
    if (await bedingung()) {
      return;
    }

    await new Promise((fertig) => setTimeout(fertig, 100));
  }

  throw new Error('Bedingung nicht erreicht.');
};

const verbinden = async (
  wer: 'google' | 'microsoft',
  zweck: 'postfach' | 'kalender',
  optionen: { fremdesCookie?: boolean } = {},
): Promise<URL> => {
  const { url, bindung } = await oauth.starten(ich, wer, zweck);
  const { state, code } = anbieter.anmelden(url);
  const antwort = new FakeAntwort();

  await controller.rueckruf(
    {
      headers: {
        cookie: `andere=1; ${OAUTH_COOKIE}=${
          optionen.fremdesCookie === true ? 'fremd' : bindung
        }`,
      },
    } as never,
    antwort as never,
    state,
    code,
  );

  return new URL(antwort.ziel);
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  kalender.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await new Promise((fertig) => setTimeout(fertig, 300));
  await dataSource.query(
    'TRUNCATE TABLE oauth_vorgaenge, oauth_zugaenge, kalender_eintraege, kalender_verbindungen, appointment_attendees, appointments, mail_messages, mailboxes, workspaces, users CASCADE',
  );

  einstellungen = {
    apiOrigin: WEB,
    google: { clientId: 'g-id', clientSecret: 'geheim' },
    microsoft: { clientId: 'm-id', clientSecret: 'geheim', tenant: 'common' },
  };
  anbieter = new FakeAnbieter();
  reader = new FakeReader();
  sender = new FakeSender();
  oauth = new OAuthService(
    zugaenge(),
    dataSource.getRepository(OAuthVorgangEntity),
    config,
    anbieter.transport,
  );
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
    oauth,
  );
  kalender?.onModuleDestroy();
  kalender = new KalenderSyncService(
    verbindungen(),
    eintraege(),
    termine(),
    dataSource.getRepository(AppointmentAttendeeEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(UserEntity),
    mailboxes,
    config,
    anbieter.transport,
    oauth,
  );
  controller = new OAuthController(oauth, mailboxes, kalender, config);

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Wir', slug: 'wir' }))
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
});

describe('Anmeldung beim Anbieter', () => {
  it('bietet nur eingerichtete Anbieter an', async () => {
    expect(oauth.konfiguriert()).toEqual(['google', 'microsoft']);

    einstellungen = {
      ...einstellungen,
      microsoft: { clientId: '', clientSecret: '' },
    };

    expect(oauth.konfiguriert()).toEqual(['google']);
    await expect(
      oauth.starten(ich, 'microsoft', 'postfach'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      oauth.starten(ich, 'google', 'adressbuch'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      oauth.starten(
        { ...ich, apiKey: { id: 'k' } } as unknown as RequestUser,
        'google',
        'postfach',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('schickt mit PKCE, state und nur den nötigen Berechtigungen zur Anmeldung', async () => {
    const { url } = await oauth.starten(ich, 'google', 'postfach');
    const adresse = new URL(url);

    expect(adresse.origin).toBe('https://accounts.google.com');
    expect(adresse.searchParams.get('code_challenge_method')).toBe('S256');
    expect(adresse.searchParams.get('redirect_uri')).toBe(
      `${WEB}/oauth/rueckruf`,
    );
    expect(adresse.searchParams.get('scope')).toBe(
      'openid email https://mail.google.com/',
    );
    expect(adresse.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const ms = new URL((await oauth.starten(ich, 'microsoft', 'kalender')).url);

    expect(ms.origin).toBe('https://login.microsoftonline.com');
    expect(ms.pathname).toBe('/common/oauth2/v2.0/authorize');
    expect(ms.searchParams.get('scope')).toContain('Calendars.ReadWrite');
    expect(ms.searchParams.get('scope')).not.toContain('Mail.');

    const gespeichert = await dataSource
      .getRepository(OAuthVorgangEntity)
      .find();

    expect(gespeichert.map((v) => v.stateHash)).not.toContain(
      adresse.searchParams.get('state'),
    );
  });

  it('nimmt einen state nur einmal, nur im selben Browser und nur zehn Minuten', async () => {
    const fremd = await verbinden('google', 'postfach', {
      fremdesCookie: true,
    });

    expect(fremd.pathname).toBe('/postfach');
    expect(fremd.searchParams.get('oauth')).toBe('fehler');
    expect(fremd.searchParams.get('grund')).toContain('anderen Browser');
    expect(await zugaenge().count()).toBe(0);

    const { url, bindung } = await oauth.starten(ich, 'google', 'postfach');
    const { state, code } = anbieter.anmelden(url);

    await oauth.abschliessen({ state, code, bindung });
    await expect(
      oauth.abschliessen({ state, code, bindung }),
    ).rejects.toBeInstanceOf(OAuthFehler);

    const zweiter = await oauth.starten(ich, 'google', 'postfach');
    const anmeldung = anbieter.anmelden(zweiter.url);

    await dataSource
      .getRepository(OAuthVorgangEntity)
      .update({ userId }, { gueltigBis: new Date(Date.now() - 1000) });
    await expect(
      oauth.abschliessen({ ...anmeldung, bindung: zweiter.bindung }),
    ).rejects.toThrow('abgelaufen');
  });

  it('meldet einen Abbruch beim Anbieter verständlich', async () => {
    const { url } = await oauth.starten(ich, 'microsoft', 'kalender');
    const state = new URL(url).searchParams.get('state') ?? '';
    const antwort = new FakeAntwort();

    await controller.rueckruf(
      { headers: {} } as never,
      antwort as never,
      state,
      undefined,
      'access_denied',
    );

    const ziel = new URL(antwort.ziel);

    expect(ziel.pathname).toBe('/kalender');
    expect(ziel.searchParams.get('grund')).toContain('abgebrochen');
    expect(antwort.geloescht).toContain(OAUTH_COOKIE);
    expect(await dataSource.getRepository(OAuthVorgangEntity).count()).toBe(0);
  });

  it('liest die Adresse aus dem id_token und lässt nur feste Rechner zu', () => {
    expect(kontoAusIdToken(idToken({ email: 'A@B.de' }))).toBe('a@b.de');
    expect(
      kontoAusIdToken(
        idToken({ preferred_username: 'x@firma.onmicrosoft.com' }),
      ),
    ).toBe('x@firma.onmicrosoft.com');
    expect(kontoAusIdToken('kaputt')).toBeNull();
    expect(
      istErlaubterHost(new URL('https://graph.microsoft.com/v1.0/me')),
    ).toBe(true);
    expect(
      istErlaubterHost(new URL('http://graph.microsoft.com/v1.0/me')),
    ).toBe(false);
    expect(
      istErlaubterHost(new URL('https://graph.microsoft.com.evil.de/')),
    ).toBe(false);
  });
});

describe('Zugriffstoken', () => {
  it('versiegelt die Token, erneuert rechtzeitig und merkt sich einen Widerruf', async () => {
    const ziel = await verbinden('microsoft', 'postfach');

    expect(ziel.searchParams.get('oauth')).toBe('ok');

    const [zugang] = await zugaenge().find();

    expect(zugang.konto).toBe('ich@wir.de');
    expect(zugang.erneuerungVersiegelt).toMatch(/^v2:[0-9a-f]{8}:/);
    expect(zugang.erneuerungVersiegelt).not.toContain('erneuerung-');

    const vorher = anbieter.anfragen.length;
    const erstes = await oauth.zugriffstoken(zugang.id);

    expect(anbieter.anfragen.length).toBe(vorher);

    await zugaenge().update(
      { id: zugang.id },
      { zugriffBis: new Date(Date.now() - 1000) },
    );

    const [zweites, drittes] = await Promise.all([
      oauth.zugriffstoken(zugang.id),
      oauth.zugriffstoken(zugang.id),
    ]);

    expect(zweites).not.toBe(erstes);
    expect(drittes).toBe(zweites);
    expect(
      (await zugaenge().findOneByOrFail({ id: zugang.id }))
        .erneuerungVersiegelt,
    ).not.toBe(zugang.erneuerungVersiegelt);

    anbieter.gueltig.clear();
    await zugaenge().update(
      { id: zugang.id },
      { zugriffBis: new Date(Date.now() - 1000) },
    );
    await expect(oauth.zugriffstoken(zugang.id)).rejects.toBeInstanceOf(
      OAuthWiderrufen,
    );
    expect(
      (await zugaenge().findOneByOrFail({ id: zugang.id })).widerrufenAm,
    ).not.toBeNull();

    const anzahl = anbieter.anfragen.length;

    await expect(oauth.zugriffstoken(zugang.id)).rejects.toBeInstanceOf(
      OAuthWiderrufen,
    );
    expect(anbieter.anfragen.length).toBe(anzahl);
  });

  it('gibt den Zugang bei Google beim Trennen zurück', async () => {
    await verbinden('google', 'postfach');

    expect(anbieter.gueltig.size).toBe(1);

    await mailboxes.disconnect(workspaceId, userId);

    expect(anbieter.gueltig.size).toBe(0);
    expect(await zugaenge().count()).toBe(0);
    expect(anbieter.anfragen.some((a) => a.url.pathname === '/revoke')).toBe(
      true,
    );
  });
});

describe('Postfach über den Anbieter', () => {
  it('meldet sich mit XOAUTH2 an den festen Servern an, ohne Passwort', async () => {
    const ziel = await verbinden('google', 'postfach');

    expect(ziel.toString()).toBe(`${WEB}/postfach?oauth=ok`);

    const postfach = await mailboxes.find(workspaceId, userId);

    expect(postfach).toMatchObject({
      host: 'imap.gmail.com',
      port: 993,
      username: 'ich@wir.de',
      passwordSealed: '',
      oauthAnbieter: 'google',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
    });
    expect(reader.geprueft[0].accessToken).toMatch(/^zugriff-/);

    await mailboxes.sync(workspaceId, userId);

    expect(reader.gelesen[0]).toMatchObject({
      host: 'imap.gmail.com',
      password: '',
    });
    expect(reader.gelesen[0].accessToken).toMatch(/^zugriff-/);

    await mailboxes.senden(workspaceId, userId, {
      an: ['kunde@example.de'],
      betreff: 'Hallo',
      rumpf: 'Text',
    });

    expect(sender.zugaenge[0]).toMatchObject({
      host: 'smtp.gmail.com',
      user: 'ich@wir.de',
      passwort: '',
    });
    expect(sender.zugaenge[0].zugriffstoken).toMatch(/^zugriff-/);
  });

  it('bittet nach einem Widerruf ums Neuverbinden', async () => {
    await verbinden('microsoft', 'postfach');

    const postfach = await mailboxes.find(workspaceId, userId);

    anbieter.gueltig.clear();
    await zugaenge().update(
      { userId },
      { zugriffBis: new Date(Date.now() - 1000) },
    );

    await expect(mailboxes.sync(workspaceId, userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(
      (
        await dataSource
          .getRepository(MailboxEntity)
          .findOneByOrFail({ id: postfach?.id })
      ).lastError,
    ).toContain('neu verbinden');
  });

  it('verbindet nichts, wenn der Server das Token nicht annimmt', async () => {
    reader.check = () =>
      Promise.reject(new BadRequestException('Anmeldung abgelehnt.'));

    const ziel = await verbinden('google', 'postfach');

    expect(ziel.searchParams.get('oauth')).toBe('fehler');
    expect(ziel.searchParams.get('grund')).toBe('Anmeldung abgelehnt.');
    expect(await mailboxes.find(workspaceId, userId)).toBeNull();
    expect(await zugaenge().count()).toBe(0);
  });
});

const termin = (titel: string) =>
  termine().create({
    workspaceId,
    ownerId: userId,
    createdById: userId,
    title: titel,
    description: null,
    location: null,
    startsAt: new Date('2026-11-02T09:00:00Z'),
    endsAt: new Date('2026-11-02T10:00:00Z'),
    allDay: false,
    remindMinutesBefore: null,
    remindedAt: null,
    recurrence: null,
    skippedDates: [],
    companyId: null,
    contactId: null,
    dealId: null,
  });

const JETZT = new Date('2026-10-20T08:00:00Z');

const kalenderVerbinden = async (
  wer: 'google' | 'microsoft',
): Promise<KalenderVerbindungEntity> => {
  const ziel = await verbinden(wer, 'kalender');

  expect(ziel.toString()).toBe(`${WEB}/kalender?oauth=ok`);

  await bis(
    async () =>
      (await verbindungen().findOneByOrFail({ userId })).letzterSyncAm !== null,
  );

  return verbindungen().findOneByOrFail({ userId });
};

describe('Google Kalender', () => {
  it('findet den Hauptkalender und gleicht über CalDAV mit Token ab', async () => {
    const verbindung = await kalenderVerbinden('google');

    expect(verbindung).toMatchObject({
      anbieter: 'google',
      benutzer: 'ich@wir.de',
      passwortVersiegelt: '',
      kalenderName: 'Ich',
      kalenderUrl:
        'https://apidata.googleusercontent.com/caldav/v2/ich%40wir.de/events/',
    });

    const neu = await termine().save(termin('Besprechung'));

    await kalender.terminWeitergeben(workspaceId, neu.id);

    const put = anbieter.anfragen.find((a) => a.methode === 'PUT');

    expect(put?.url.toString()).toBe(
      `https://apidata.googleusercontent.com/caldav/v2/ich%40wir.de/events/${neu.id}.ics`,
    );
    expect(put?.kopf.authorization).toMatch(/^Bearer zugriff-/);

    const ergebnis = await kalender.abgleichen(
      await verbindungen().findOneByOrFail({ id: verbindung.id }),
      JETZT,
    );

    expect(ergebnis).toEqual({
      neu: 0,
      geaendert: 0,
      geloescht: 0,
      hochgeladen: 0,
    });
  });
});

describe('Outlook-Kalender über Microsoft Graph', () => {
  it('legt an, übernimmt, löscht — und schaukelt sich nicht auf', async () => {
    const verbindung = await kalenderVerbinden('microsoft');

    expect(verbindung).toMatchObject({
      anbieter: 'microsoft',
      kalenderName: 'Kalender',
      kalenderUrl: 'https://graph.microsoft.com/v1.0/me/calendars/AAA',
    });

    const neu = await termine().save(termin('Angebot besprechen'));

    await kalender.terminWeitergeben(workspaceId, neu.id);

    const post = anbieter.anfragen.find(
      (a) => a.methode === 'POST' && a.url.hostname === 'graph.microsoft.com',
    );
    const inhalt = JSON.parse(post?.rumpf ?? '{}') as Record<string, unknown>;

    expect(inhalt).toMatchObject({
      subject: 'Angebot besprechen',
      start: { dateTime: '2026-11-02T10:00:00', timeZone: 'Europe/Berlin' },
      transactionId: `${neu.id}@app.stegwerk.test`,
    });
    expect(inhalt).not.toHaveProperty('attendees');

    const [eintrag] = await eintraege().find();

    expect(eintrag.href).toMatch(
      /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/events\/ev\d+$/,
    );

    const stand = await verbindungen().findOneByOrFail({ id: verbindung.id });

    expect(await kalender.abgleichen(stand, JETZT)).toEqual({
      neu: 0,
      geaendert: 0,
      geloescht: 0,
      hochgeladen: 0,
    });

    anbieter.graph.set('dort1', {
      id: 'dort1',
      iCalUId: 'outlook-1',
      '@odata.etag': 'W/"x1"',
      kalender: 'AAA',
      type: 'singleInstance',
      subject: 'Werkstattbesuch',
      body: { contentType: 'text', content: 'Mit Kaffee' },
      location: { displayName: 'Halle 3' },
      start: { dateTime: '2026-11-05T13:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-11-05T14:30:00.0000000', timeZone: 'UTC' },
      isAllDay: false,
      lastModifiedDateTime: '2026-10-20T07:00:00Z',
      attendees: [],
    });

    expect((await kalender.abgleichen(stand, JETZT)).neu).toBe(1);

    const uebernommen = await termine().findOneByOrFail({
      title: 'Werkstattbesuch',
    });

    expect(uebernommen).toMatchObject({
      location: 'Halle 3',
      description: 'Mit Kaffee',
      quelle: 'kalender',
    });
    expect(uebernommen.startsAt.toISOString()).toBe('2026-11-05T13:00:00.000Z');

    anbieter.graph.delete('dort1');

    expect((await kalender.abgleichen(stand, JETZT)).geloescht).toBe(1);
    expect(await termine().findOneBy({ id: uebernommen.id })).toBeNull();

    await kalender.loeschungWeitergeben(workspaceId, neu.id);

    expect(anbieter.graph.size).toBe(0);
  });

  it('übersetzt Wiederholungen hin und zurück', () => {
    const start = new Date('2026-11-02T09:00:00Z');

    for (const regel of [
      'FREQ=DAILY;INTERVAL=2;COUNT=5',
      'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231',
      'FREQ=MONTHLY;BYDAY=-1FR',
      'FREQ=MONTHLY',
      'FREQ=YEARLY',
    ]) {
      expect(graphZuRegel(regelZuGraph(parseRule(regel), start))).toEqual(
        parseRule(regel),
      );
    }

    expect(
      graphZuRegel({
        pattern: { type: 'relativeYearly' },
        range: { type: 'noEnd' },
      }),
    ).toBeNull();
  });
});
