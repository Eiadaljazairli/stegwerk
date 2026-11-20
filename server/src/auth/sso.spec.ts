import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { type DataSource } from 'typeorm';

import {
  type HttpAnfrage,
  type HttpAntwort,
} from '../kalender-sync/caldav-client';
import { type MailService } from '../mail/mail.service';
import { mailSchluessel, seal } from '../mailboxes/secret-box';
import { type SicherheitsMeldung, hoereSicherheit } from '../sicherheit/melden';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
} from './anmeldung-sso.entities';
import { AuthService } from './auth.service';
import { EmailVerificationEntity } from './email-verification.entity';
import { EmailVerificationsService } from './email-verifications.service';
import { PasswordResetEntity } from './password-reset.entity';
import { PasswordResetsService } from './password-resets.service';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RefreshTokensService } from './refresh-tokens.service';
import { SsoController } from './sso.controller';
import { SITZUNGS_COOKIE } from './sitzungs-cookie';
import { SSO_COOKIE, SSO_EINLOESE_COOKIE, SsoResolver } from './sso.resolver';
import { SsoFehler, SsoService } from './sso.service';
import { codeFuer, neuesGeheimnis, zaehlerFuer } from './totp';
import { TwoFactorService } from './two-factor.service';

const SUITE = 'sso_anmeldung';
const WEB = 'https://app.stegwerk.test';
const MAIL_KEY = randomBytes(32).toString('base64');
const TOTP_KEY = randomBytes(32).toString('base64');
const TID = '11111111-2222-3333-4444-555555555555';

jest.setTimeout(60_000);

const werte: Record<string, unknown> = {
  webOrigin: WEB,
  refreshTokenDays: 30,
  mailEncryptionKey: MAIL_KEY,
  totpEncryptionKey: TOTP_KEY,
  oauth: {
    apiOrigin: WEB,
    google: { clientId: 'google-client', clientSecret: 'g-geheim' },
    microsoft: {
      clientId: 'ms-client',
      clientSecret: 'm-geheim',
      tenant: 'common',
    },
  },
};

const config = {
  get: (key: string) => werte[key],
  getOrThrow: (key: string) => werte[key] ?? WEB,
} as unknown as ConfigService;

const json = (status: number, inhalt: unknown): HttpAntwort => ({
  status,
  kopf: { 'content-type': 'application/json' },
  rumpf: JSON.stringify(inhalt),
});

class FakeAnbieter {
  private readonly paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
  faelscher: ReturnType<typeof generateKeyPairSync> | null = null;
  anfragen: HttpAnfrage[] = [];
  private readonly codes = new Map<
    string,
    { challenge: string; inhalt: Record<string, unknown> }
  >();
  private zaehler = 0;

  anmelden(
    url: string,
    inhalt: Record<string, unknown>,
  ): { state: string; code: string } {
    const adresse = new URL(url);
    const code = `code-${String((this.zaehler += 1))}`;
    const client = adresse.searchParams.get('client_id');
    const microsoft = adresse.hostname === 'login.microsoftonline.com';
    const jetzt = Math.floor(Date.now() / 1000);

    this.codes.set(code, {
      challenge: adresse.searchParams.get('code_challenge') ?? '',
      inhalt: {
        aud: client,
        nonce: adresse.searchParams.get('nonce'),
        iat: jetzt,
        exp: jetzt + 600,
        ...(microsoft
          ? {
              iss: `https://login.microsoftonline.com/${TID}/v2.0`,
              tid: TID,
            }
          : { iss: 'https://accounts.google.com' }),
        ...inhalt,
      },
    });

    return { state: adresse.searchParams.get('state') ?? '', code };
  }

  private jwt(inhalt: Record<string, unknown>): string {
    const teile = [{ alg: 'RS256', kid: 'k1' }, inhalt].map((teil) =>
      Buffer.from(JSON.stringify(teil)).toString('base64url'),
    );
    const schluessel = (this.faelscher ?? this.paar).privateKey;

    return [
      ...teile,
      sign('RSA-SHA256', Buffer.from(teile.join('.')), schluessel).toString(
        'base64url',
      ),
    ].join('.');
  }

  transport = (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    this.anfragen.push(anfrage);

    if (anfrage.methode === 'GET') {
      return Promise.resolve(
        json(200, {
          keys: [
            { ...this.paar.publicKey.export({ format: 'jwk' }), kid: 'k1' },
          ],
        }),
      );
    }

    const rumpf = new URLSearchParams(anfrage.rumpf ?? '');
    const eintrag = this.codes.get(rumpf.get('code') ?? '');

    if (
      eintrag === undefined ||
      rumpf.get('redirect_uri') !== `${WEB}/oauth/anmelden/rueckruf` ||
      createHash('sha256')
        .update(rumpf.get('code_verifier') ?? '')
        .digest('base64url') !== eintrag.challenge
    ) {
      return Promise.resolve(json(400, { error: 'invalid_grant' }));
    }

    this.codes.delete(rumpf.get('code') ?? '');

    return Promise.resolve(
      json(200, {
        access_token: 'egal',
        expires_in: 3600,
        id_token: this.jwt(eintrag.inhalt),
      }),
    );
  };
}

let dataSource: DataSource;
let auth: AuthService;
let sso: SsoService;
let anbieter: FakeAnbieter;
const mail = { send: jest.fn().mockResolvedValue(true) };
const meldungen: SicherheitsMeldung[] = [];
const ohneHoerer = hoereSicherheit((m) => meldungen.push(m));

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  anbieter = new FakeAnbieter();
  auth = new AuthService(
    dataSource,
    new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: '15m' },
    }),
    new RefreshTokensService(
      dataSource.getRepository(RefreshTokenEntity),
      config,
    ),
    new TwoFactorService(dataSource, config),
    new EmailVerificationsService(
      dataSource.getRepository(EmailVerificationEntity),
      dataSource.getRepository(UserEntity),
      mail as unknown as MailService,
      config,
    ),
  );
  sso = new SsoService(dataSource, config, auth, anbieter.transport);
});

afterAll(async () => {
  ohneHoerer();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE users, workspaces CASCADE');
  await dataSource.query(
    'TRUNCATE TABLE anmelde_vorgaenge, anmelde_einloesungen',
  );
  mail.send.mockClear();
  meldungen.length = 0;
});

const cookies = new Map<string, string>();

const durchlauf = async (
  start: Parameters<SsoService['starten']>[0],
  inhalt: Record<string, unknown>,
  bindungUeberschreiben?: string | null,
): Promise<string> => {
  const { url, bindung } = await sso.starten(start);
  const { state, code } = anbieter.anmelden(url, inhalt);
  const { ziel, einloesung } = await sso.abschliessen({
    state,
    code,
    bindung:
      bindungUeberschreiben === undefined ? bindung : bindungUeberschreiben,
  });

  if (einloesung !== null) {
    cookies.set(new URL(ziel).hash.replace(/^#sso=/u, ''), einloesung);
  }

  return ziel;
};

const einloesen = (marke: string, totpCode?: string) =>
  sso.einloesen(marke, cookies.get(marke) ?? null, totpCode);

const markeAus = (ziel: string): string => {
  const url = new URL(ziel);

  expect(url.origin + url.pathname).toBe(`${WEB}/anmelden`);
  expect(url.search).toBe('');

  return url.hash.replace(/^#sso=/u, '');
};

const googleKonto = (mehr: Record<string, unknown> = {}) => ({
  sub: 'g-111',
  email: 'ada@example.de',
  email_verified: true,
  given_name: 'Ada',
  family_name: 'Lovelace',
  ...mehr,
});

const microsoftKonto = (mehr: Record<string, unknown> = {}) => ({
  oid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'max@firma.de',
  given_name: 'Max',
  family_name: 'Muster',
  ...mehr,
});

const mitPasswort = async (
  email: string,
  bestaetigt = true,
): Promise<{ user: UserEntity; workspace: WorkspaceEntity }> => {
  const angelegt = await auth.kontoAnlegen({
    email,
    passwordHash: await bcrypt.hash('EinLangesPasswort1', 4),
    passwortGesetzt: true,
    firstName: 'Inge',
    lastName: 'Inhaber',
    workspaceName: `Bereich ${email}`,
    emailVerifiedAt: bestaetigt ? new Date() : null,
  });

  return angelegt;
};

describe('Einrichtung', () => {
  it('bietet nur Anbieter an, deren Kennungen gesetzt sind', () => {
    expect(sso.konfiguriert()).toEqual(['google', 'microsoft']);

    const ohne = new SsoService(
      dataSource,
      {
        get: (key: string) =>
          key === 'oauth'
            ? {
                apiOrigin: WEB,
                google: { clientId: 'x', clientSecret: '' },
                microsoft: { clientId: '', clientSecret: '' },
              }
            : werte[key],
      } as unknown as ConfigService,
      auth,
      anbieter.transport,
    );

    expect(ohne.konfiguriert()).toEqual([]);
  });

  it('beginnt mit PKCE, state, nonce und nur den Bereichen zum Anmelden', async () => {
    const { url, bindung } = await sso.starten({
      anbieter: 'google',
      zweck: 'anmelden',
    });
    const adresse = new URL(url);

    expect(adresse.hostname).toBe('accounts.google.com');
    expect(adresse.searchParams.get('code_challenge_method')).toBe('S256');
    expect(adresse.searchParams.get('scope')).toBe('openid email profile');
    expect(adresse.searchParams.get('redirect_uri')).toBe(
      `${WEB}/oauth/anmelden/rueckruf`,
    );
    expect(adresse.searchParams.get('nonce')).toMatch(/^[\w-]{40,}$/u);
    expect(bindung).toMatch(/^[\w-]{40,}$/u);

    const vorgang = await dataSource
      .getRepository(AnmeldeVorgangEntity)
      .findOneOrFail({ where: {} });

    expect(JSON.stringify(vorgang)).not.toContain(
      adresse.searchParams.get('state'),
    );
    expect(JSON.stringify(vorgang)).not.toContain(
      adresse.searchParams.get('nonce'),
    );
  });

  it('lehnt einen nicht eingerichteten Anbieter und Registrieren ohne Bereich ab', async () => {
    await expect(
      sso.starten({ anbieter: 'github', zweck: 'anmelden' }),
    ).rejects.toThrow('nicht eingerichtet');
    await expect(
      sso.starten({
        anbieter: 'google',
        zweck: 'registrieren',
        arbeitsbereich: ' ',
      }),
    ).rejects.toThrow('Arbeitsbereichs');
  });
});

describe('Registrieren', () => {
  it('legt mit Google Konto und Bereich an, Adresse bestätigt, ohne Passwort', async () => {
    const marke = markeAus(
      await durchlauf(
        {
          anbieter: 'google',
          zweck: 'registrieren',
          arbeitsbereich: 'Nordwind',
        },
        googleKonto(),
      ),
    );
    const payload = await einloesen(marke);

    expect(payload.user.email).toBe('ada@example.de');
    expect(payload.user.firstName).toBe('Ada');
    expect(payload.user.emailVerifiedAt).not.toBeNull();
    expect(payload.user.passwortGesetzt).toBe(false);
    expect(payload.workspace.name).toBe('Nordwind');
    expect(payload.token).not.toBe('');

    const sitz = await dataSource
      .getRepository(MembershipEntity)
      .findOneOrFail({ where: { userId: payload.user.id } });

    expect(sitz.role).toBe(MembershipRole.OWNER);
    expect(mail.send).not.toHaveBeenCalled();
    expect(meldungen.map((m) => m.art)).toEqual(
      expect.arrayContaining(['sso_verknuepft', 'anmeldung']),
    );
    expect(meldungen.find((m) => m.art === 'anmeldung')?.details).toEqual({
      weg: 'google',
    });
  });

  it('legt mit Microsoft an, aber mit unbestätigter Adresse und Bestätigungsmail', async () => {
    const marke = markeAus(
      await durchlauf(
        { anbieter: 'microsoft', zweck: 'registrieren', arbeitsbereich: 'Süd' },
        microsoftKonto(),
      ),
    );
    const payload = await einloesen(marke);

    expect(payload.user.emailVerifiedAt).toBeNull();
    expect(mail.send).toHaveBeenCalledTimes(1);

    const verknuepfung = await dataSource
      .getRepository(AnmeldeVerknuepfungEntity)
      .findOneOrFail({ where: { userId: payload.user.id } });

    expect(verknuepfung.subjekt).toBe(
      `${TID}:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
    );
  });
});

describe('Anmelden', () => {
  it('findet das Konto über die Kennung, auch wenn sich die Adresse ändert', async () => {
    const erste = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'N' },
          googleKonto(),
        ),
      ),
    );
    const zweite = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden' },
          googleKonto({ email: 'ada.neu@example.de' }),
        ),
      ),
    );

    expect(zweite.user.id).toBe(erste.user.id);
    expect(zweite.workspace.id).toBe(erste.workspace.id);
  });

  it('übernimmt „Angemeldet bleiben“ vom Klick bis in die Sitzung', async () => {
    await mitPasswort('ada@example.de');

    const kurz = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden', angemeldetBleiben: false },
          googleKonto(),
        ),
      ),
    );
    const lang = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden', angemeldetBleiben: true },
          googleKonto(),
        ),
      ),
    );
    const tokens = await dataSource
      .getRepository(RefreshTokenEntity)
      .find({ where: { userId: kurz.user.id }, order: { createdAt: 'ASC' } });

    expect(kurz.angemeldetBleiben).toBe(false);
    expect(lang.angemeldetBleiben).toBe(true);
    expect(tokens.map((t) => t.dauerhaft)).toEqual([false, true]);
  });

  it('sagt beim Anmelden ohne Konto, dass erst registriert werden muss', async () => {
    await expect(
      durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    ).rejects.toThrow('noch kein Stegwerk-Konto');
    expect(await dataSource.getRepository(UserEntity).count()).toBe(0);
  });

  it('verknüpft ein Konto mit Passwort nur, wenn Google und Stegwerk die Adresse bestätigt haben', async () => {
    const { user, workspace } = await mitPasswort('ada@example.de');
    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden' },
          googleKonto(),
        ),
      ),
    );

    expect(payload.user.id).toBe(user.id);
    expect(payload.workspace.id).toBe(workspace.id);
    expect(payload.user.passwortGesetzt).toBe(true);
  });

  it('verknüpft nicht über eine Adresse, die Google nicht bestätigt', async () => {
    await mitPasswort('ada@example.de');

    await expect(
      durchlauf(
        { anbieter: 'google', zweck: 'anmelden' },
        googleKonto({ email_verified: false }),
      ),
    ).rejects.toThrow('schon ein Stegwerk-Konto');
  });

  it('verknüpft nicht mit einem Stegwerk-Konto, dessen Adresse unbestätigt ist', async () => {
    await mitPasswort('ada@example.de', false);

    await expect(
      durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    ).rejects.toThrow('schon ein Stegwerk-Konto');
    expect(
      await dataSource.getRepository(AnmeldeVerknuepfungEntity).count(),
    ).toBe(0);
  });

  it('verknüpft Microsoft nie über die Adresse', async () => {
    await mitPasswort('max@firma.de');

    await expect(
      durchlauf({ anbieter: 'microsoft', zweck: 'anmelden' }, microsoftKonto()),
    ).rejects.toMatchObject({ code: 'konto_vorhanden', anbieter: 'microsoft' });
  });

  it('lehnt Rückruf aus fremdem Browser, zweiten Rückruf und fremde Signatur ab', async () => {
    await mitPasswort('ada@example.de');

    await expect(
      durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto(), null),
    ).rejects.toThrow('anderen Browser');
    await expect(
      durchlauf(
        { anbieter: 'google', zweck: 'anmelden' },
        googleKonto(),
        'falsche-bindung',
      ),
    ).rejects.toThrow('anderen Browser');

    const { url, bindung } = await sso.starten({
      anbieter: 'google',
      zweck: 'anmelden',
    });
    const { state, code } = anbieter.anmelden(url, googleKonto());

    await sso.abschliessen({ state, code, bindung });
    await expect(sso.abschliessen({ state, code, bindung })).rejects.toThrow(
      'unbekannt oder schon benutzt',
    );

    anbieter.faelscher = generateKeyPairSync('rsa', { modulusLength: 2048 });

    try {
      await expect(
        durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
      ).rejects.toThrow(SsoFehler);
    } finally {
      anbieter.faelscher = null;
    }
  });

  it('lehnt ein id_token mit fremder nonce ab', async () => {
    await mitPasswort('ada@example.de');

    await expect(
      durchlauf(
        { anbieter: 'google', zweck: 'anmelden' },
        googleKonto({ nonce: 'aus-einer-anderen-anmeldung' }),
      ),
    ).rejects.toThrow('gehört nicht zu dieser Anmeldung');
  });

  it('verlangt danach den zweiten Faktor, wenn das Konto ihn hat', async () => {
    const { user } = await mitPasswort('ada@example.de');
    const geheimnis = neuesGeheimnis();

    await dataSource.getRepository(UserEntity).update(user.id, {
      totpSecret: seal(
        geheimnis,
        mailSchluessel({ get: () => TOTP_KEY } as never),
      ),
      totpEnabledAt: new Date(),
    });

    const marke = markeAus(
      await durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    );

    await expect(einloesen(marke)).rejects.toMatchObject({
      response: { reason: 'TWO_FACTOR_REQUIRED' },
    });
    await expect(einloesen(marke, '000000')).rejects.toThrow();

    const payload = await einloesen(
      marke,
      codeFuer(geheimnis, zaehlerFuer(Date.now())),
    );

    expect(payload.user.id).toBe(user.id);
    await expect(einloesen(marke)).rejects.toThrow('abgelaufen');
  });

  it('löst eine weitergereichte Marke in keinem anderen Browser ein', async () => {
    const angreifer = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'A' },
          googleKonto({ sub: 'g-angreifer', email: 'mallory@example.de' }),
        ),
      ),
    );
    const marke = markeAus(
      await durchlauf(
        { anbieter: 'google', zweck: 'anmelden' },
        googleKonto({ sub: 'g-angreifer', email: 'mallory@example.de' }),
      ),
    );

    await expect(sso.einloesen(marke, null)).rejects.toThrow('anderen Browser');
    await expect(
      sso.einloesen(marke, randomBytes(32).toString('base64url')),
    ).rejects.toThrow('anderen Browser');
    const andere = markeAus(
      await durchlauf(
        { anbieter: 'google', zweck: 'anmelden' },
        googleKonto({ sub: 'g-angreifer', email: 'mallory@example.de' }),
      ),
    );

    await expect(
      sso.einloesen(marke, cookies.get(andere) ?? null),
    ).rejects.toThrow('anderen Browser');

    expect((await einloesen(marke)).user.id).toBe(angreifer.user.id);
  });

  it('lehnt eine abgelaufene oder erfundene Marke ab', async () => {
    await expect(einloesen('erfunden')).rejects.toThrow('abgelaufen');

    const marke = markeAus(
      await durchlauf(
        { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'N' },
        googleKonto(),
      ),
    );

    await dataSource
      .createQueryBuilder()
      .update(AnmeldeEinloesungEntity)
      .set({ gueltigBis: new Date(Date.now() - 1000) })
      .execute();
    await expect(einloesen(marke)).rejects.toThrow('abgelaufen');
  });
});

describe('Verknüpfen und Trennen, mit Rechten', () => {
  const nurLesendIn = async (workspaceId: string, email: string) => {
    const user = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email,
        passwordHash: await bcrypt.hash('EinLangesPasswort2', 4),
        firstName: 'Lea',
        lastName: 'Leser',
        emailVerifiedAt: new Date(),
      }),
    );
    const rolle = await dataSource
      .getRepository(RoleEntity)
      .findOneOrFail({ where: { workspaceId, templateKey: 'readonly' } });

    await dataSource.getRepository(MembershipEntity).save({
      userId: user.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle.id,
    });

    return user;
  };

  it('lässt auch eine eingeschränkte Rolle ihr eigenes Konto verknüpfen und landet in ihrem Bereich', async () => {
    const inhaberin = await mitPasswort('chefin@example.de');
    const lea = await nurLesendIn(inhaberin.workspace.id, 'lea@example.de');

    await expect(sso.verknuepfenErlaubt(lea.id, 'falsch')).rejects.toThrow(
      'Passwort stimmt nicht',
    );
    await sso.verknuepfenErlaubt(lea.id, 'EinLangesPasswort2');

    const ziel = await durchlauf(
      { anbieter: 'google', zweck: 'verknuepfen', userId: lea.id },
      googleKonto({ sub: 'g-lea', email: 'lea.privat@gmail.com' }),
    );

    expect(ziel).toBe(
      `${WEB}/team?sso=verknuepft&anbieter=google#anmeldemethoden`,
    );
    expect(meldungen.find((m) => m.art === 'sso_verknuepft')?.details).toEqual({
      anbieter: 'google',
      neuesKonto: false,
    });

    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden' },
          googleKonto({ sub: 'g-lea', email: 'lea.privat@gmail.com' }),
        ),
      ),
    );

    expect(payload.user.id).toBe(lea.id);
    expect(payload.workspace.id).toBe(inhaberin.workspace.id);

    const sitz = await dataSource
      .getRepository(MembershipEntity)
      .findOneOrFail({ where: { userId: lea.id } });

    expect(sitz.role).toBe(MembershipRole.MEMBER);
  });

  it('verlangt vor dem Verknüpfen eine bestätigte Adresse', async () => {
    const { user } = await mitPasswort('neu@example.de', false);

    await expect(
      sso.verknuepfenErlaubt(user.id, 'EinLangesPasswort1'),
    ).rejects.toThrow('Bestätigen Sie zuerst');
  });

  it('gibt ein Google-Konto nicht an ein zweites Stegwerk-Konto, und kein fremdes zu sehen oder zu trennen', async () => {
    const a = await mitPasswort('a@example.de');
    const b = await mitPasswort('b@example.de');

    await durchlauf(
      { anbieter: 'google', zweck: 'verknuepfen', userId: a.user.id },
      googleKonto({ sub: 'g-a', email: 'a@example.de' }),
    );

    await expect(
      durchlauf(
        { anbieter: 'google', zweck: 'verknuepfen', userId: b.user.id },
        googleKonto({ sub: 'g-a', email: 'a@example.de' }),
      ),
    ).rejects.toThrow('gehört schon zu einem anderen Stegwerk-Konto');

    expect(await sso.verknuepfungenVon(b.user.id)).toEqual([]);
    expect(await sso.verknuepfungenVon(a.user.id)).toHaveLength(1);
    await expect(sso.trennen(b.user.id, 'google')).rejects.toThrow(
      'gibt es nicht',
    );
    expect(await sso.verknuepfungenVon(a.user.id)).toHaveLength(1);

    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'anmelden' },
          googleKonto({ sub: 'g-a', email: 'a@example.de' }),
        ),
      ),
    );

    expect(payload.workspace.id).toBe(a.workspace.id);
    expect(payload.workspace.id).not.toBe(b.workspace.id);
  });

  it('lässt ein zweites Google-Konto erst nach dem Trennen des ersten zu', async () => {
    const { user } = await mitPasswort('a@example.de');

    await durchlauf(
      { anbieter: 'google', zweck: 'verknuepfen', userId: user.id },
      googleKonto({ sub: 'g-1' }),
    );
    await expect(
      durchlauf(
        { anbieter: 'google', zweck: 'verknuepfen', userId: user.id },
        googleKonto({ sub: 'g-2' }),
      ),
    ).rejects.toMatchObject({ code: 'erst_trennen' });

    await sso.trennen(user.id, 'google');
    expect(meldungen.some((m) => m.art === 'sso_getrennt')).toBe(true);
    await durchlauf(
      { anbieter: 'google', zweck: 'verknuepfen', userId: user.id },
      googleKonto({ sub: 'g-2' }),
    );
    expect((await sso.verknuepfungenVon(user.id))[0].anbieter).toBe('google');
  });

  it('trennt bei einem Konto ohne Passwort nicht den letzten Weg hinein', async () => {
    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'N' },
          googleKonto(),
        ),
      ),
    );

    await expect(
      sso.verknuepfenErlaubt(payload.user.id),
    ).resolves.toBeUndefined();
    await expect(sso.trennen(payload.user.id, 'google')).rejects.toThrow(
      'einziger Weg',
    );

    await dataSource
      .getRepository(UserEntity)
      .update(payload.user.id, { passwortGesetzt: true });
    await sso.trennen(payload.user.id, 'google');
    expect(await sso.verknuepfungenVon(payload.user.id)).toEqual([]);
  });
});

describe('Offene Marke nach dem Trennen', () => {
  it('lässt eine noch nicht eingelöste Marke nach dem Trennen niemanden mehr hinein', async () => {
    const { user } = await mitPasswort('ada@example.de');
    const marke = markeAus(
      await durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    );

    await sso.trennen(user.id, 'google');

    await expect(einloesen(marke)).rejects.toThrow('abgelaufen');
    expect(
      await dataSource.getRepository(AnmeldeEinloesungEntity).count(),
    ).toBe(0);
  });

  it('löst keine Marke ein, deren Verknüpfung inzwischen fehlt', async () => {
    const { user } = await mitPasswort('ada@example.de');
    const marke = markeAus(
      await durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    );

    await dataSource
      .getRepository(AnmeldeVerknuepfungEntity)
      .delete({ userId: user.id });

    await expect(einloesen(marke)).rejects.toThrow('abgelaufen');
  });
});

describe('Vorab angelegtes Konto über Microsoft', () => {
  const zuruecksetzen = async (userId: string, passwort: string) => {
    const token = randomBytes(32).toString('base64url');

    await dataSource.getRepository(PasswordResetEntity).save({
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await new PasswordResetsService(
      dataSource.getRepository(PasswordResetEntity),
      dataSource.getRepository(UserEntity),
      new RefreshTokensService(
        dataSource.getRepository(RefreshTokenEntity),
        config,
      ),
      mail as unknown as MailService,
      config,
    ).complete(token, passwort);
  };
  it('nimmt dem Anlegenden den Weg hinein, sobald die echte Inhaberin ihr Passwort zurücksetzt', async () => {
    const vorab = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'microsoft', zweck: 'registrieren', arbeitsbereich: 'X' },
          microsoftKonto({ oid: 'ffffffff-0000-0000-0000-000000000000' }),
        ),
      ),
    );

    expect(vorab.user.emailVerifiedAt).toBeNull();

    await zuruecksetzen(vorab.user.id, 'DasNeuePasswortDerInhaberin1');

    expect(await sso.verknuepfungenVon(vorab.user.id)).toEqual([]);
    expect(meldungen.some((m) => m.art === 'sso_getrennt')).toBe(true);

    await expect(
      durchlauf(
        { anbieter: 'microsoft', zweck: 'anmelden' },
        microsoftKonto({ oid: 'ffffffff-0000-0000-0000-000000000000' }),
      ),
    ).rejects.toMatchObject({ code: 'konto_vorhanden' });
  });

  it('lässt die Verknüpfung stehen, wenn die Adresse schon bestätigt war', async () => {
    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'N' },
          googleKonto(),
        ),
      ),
    );
    await zuruecksetzen(payload.user.id, 'EinEigenesPasswort1');

    expect(await sso.verknuepfungenVon(payload.user.id)).toHaveLength(1);
  });

  it('macht eine noch offene Marke des Anlegenden mit dem Zurücksetzen wertlos', async () => {
    const microsoft = microsoftKonto({
      oid: 'ffffffff-0000-0000-0000-000000000000',
    });
    const vorab = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'microsoft', zweck: 'registrieren', arbeitsbereich: 'X' },
          microsoft,
        ),
      ),
    );
    const offen = markeAus(
      await durchlauf({ anbieter: 'microsoft', zweck: 'anmelden' }, microsoft),
    );

    await zuruecksetzen(vorab.user.id, 'DasNeuePasswortDerInhaberin1');

    await expect(einloesen(offen)).rejects.toThrow('abgelaufen');
    expect(
      await dataSource.getRepository(AnmeldeEinloesungEntity).count(),
    ).toBe(0);
  });

  it('räumt beim Zurücksetzen offene Marken und Vorgänge auch bei bestätigter Adresse ab', async () => {
    const payload = await einloesen(
      markeAus(
        await durchlauf(
          { anbieter: 'google', zweck: 'registrieren', arbeitsbereich: 'N' },
          googleKonto(),
        ),
      ),
    );
    const offen = markeAus(
      await durchlauf({ anbieter: 'google', zweck: 'anmelden' }, googleKonto()),
    );

    await sso.starten({
      anbieter: 'google',
      zweck: 'verknuepfen',
      userId: payload.user.id,
    });
    await zuruecksetzen(payload.user.id, 'EinEigenesPasswort1');

    await expect(einloesen(offen)).rejects.toThrow('abgelaufen');
    expect(
      await dataSource
        .getRepository(AnmeldeVorgangEntity)
        .count({ where: { userId: payload.user.id } }),
    ).toBe(0);
  });
});

describe('Rückruf', () => {
  const antwort = () => {
    const r = {
      ziel: '',
      kopf: {} as Record<string, string>,
      geloescht: [] as string[],
      gesetzt: {} as Record<string, { wert: string; optionen: unknown }>,
      clearCookie: (name: string) => r.geloescht.push(name),
      cookie: (name: string, wert: string, optionen: unknown) =>
        (r.gesetzt[name] = { wert, optionen }),
      setHeader: (name: string, wert: string) => (r.kopf[name] = wert),
      redirect: (_status: number, ziel: string) => (r.ziel = ziel),
    };

    return r;
  };

  it('leitet mit der Marke im Fragment weiter und räumt das Cookie ab', async () => {
    const controller = new SsoController(sso);
    const { url, bindung } = await sso.starten({
      anbieter: 'google',
      zweck: 'registrieren',
      arbeitsbereich: 'N',
    });
    const { state, code } = anbieter.anmelden(url, googleKonto());
    const r = antwort();

    await controller.rueckruf(
      { headers: { cookie: `x=1; ${SSO_COOKIE}=${bindung}` } } as never,
      r as never,
      state,
      code,
    );

    expect(r.ziel).toMatch(new RegExp(`^${WEB}/anmelden#sso=[\\w-]+$`, 'u'));
    expect(r.geloescht).toEqual([SSO_COOKIE]);
    expect(r.kopf['Referrer-Policy']).toBe('no-referrer');

    const einloesung = r.gesetzt[SSO_EINLOESE_COOKIE];

    expect(einloesung.optionen).toMatchObject({
      httpOnly: true,
      path: '/graphql',
    });

    const marke = new URL(r.ziel).hash.replace(/^#sso=/u, '');

    await expect(sso.einloesen(marke, null)).rejects.toThrow('anderen Browser');
    expect((await sso.einloesen(marke, einloesung.wert)).user.email).toBe(
      'ada@example.de',
    );
  });

  it('setzt ohne „Angemeldet bleiben“ ein Sitzungs-Cookie, sonst eines für 30 Tage', async () => {
    await mitPasswort('ada@example.de');

    const resolver = new SsoResolver(sso, config, null as never, dataSource);
    const sitzung = async (angemeldetBleiben: boolean | null) => {
      const start = antwort();
      const url = await resolver.anmeldungStarten(
        'google',
        {
          req: { res: start },
        } as never,
        angemeldetBleiben,
      );
      const { state, code } = anbieter.anmelden(url, googleKonto());
      const { ziel, einloesung } = await sso.abschliessen({
        state,
        code,
        bindung: start.gesetzt[SSO_COOKIE].wert,
      });
      const r = antwort();

      await resolver.anmeldungEinloesen(
        new URL(ziel).hash.replace(/^#sso=/u, ''),
        null,
        {
          req: {
            headers: { cookie: `${SSO_EINLOESE_COOKIE}=${einloesung}` },
            res: r,
          },
        } as never,
      );

      return r.gesetzt[SITZUNGS_COOKIE].optionen as { maxAge?: number };
    };

    expect((await sitzung(false)).maxAge).toBeUndefined();
    expect((await sitzung(true)).maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    expect((await sitzung(null)).maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('gibt bei einem Fehler nur ein Kennzeichen weiter, nie einen Satz oder die Adresse', async () => {
    await mitPasswort('max@firma.de');

    const controller = new SsoController(sso);
    const { url, bindung } = await sso.starten({
      anbieter: 'microsoft',
      zweck: 'anmelden',
    });
    const { state, code } = anbieter.anmelden(url, microsoftKonto());
    const r = antwort();

    await controller.rueckruf(
      { headers: { cookie: `${SSO_COOKIE}=${bindung}` } } as never,
      r as never,
      state,
      code,
    );

    const ziel = new URL(r.ziel);

    expect(ziel.pathname).toBe('/anmelden');
    expect(ziel.searchParams.get('sso')).toBe('fehler');
    expect(ziel.searchParams.get('grund')).toBe('konto_vorhanden');
    expect(ziel.searchParams.get('anbieter')).toBe('microsoft');
    expect(r.ziel).not.toContain('firma.de');
    expect(r.gesetzt[SSO_EINLOESE_COOKIE]).toBeUndefined();
  });

  it('meldet einen Abbruch beim Anbieter auf der Seite, von der es losging', async () => {
    const controller = new SsoController(sso);
    const { url } = await sso.starten({
      anbieter: 'microsoft',
      zweck: 'registrieren',
      arbeitsbereich: 'N',
    });
    const state = new URL(url).searchParams.get('state') ?? '';
    const r = antwort();

    await controller.rueckruf(
      { headers: {} } as never,
      r as never,
      state,
      undefined,
      'access_denied',
    );

    const ziel = new URL(r.ziel);

    expect(ziel.pathname).toBe('/registrieren');
    expect(ziel.searchParams.get('sso')).toBe('fehler');
    expect(ziel.searchParams.get('grund')).toBe('abgebrochen');
    expect(await dataSource.getRepository(AnmeldeVorgangEntity).count()).toBe(
      0,
    );
  });
});
