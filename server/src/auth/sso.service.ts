import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type DataSource, LessThan } from 'typeorm';

import {
  type HttpAntwort,
  type Transport,
} from '../kalender-sync/caldav-client';
import { mailSchluessel, open, seal } from '../mailboxes/secret-box';
import {
  type AnbieterZugang,
  anbieterDaten,
  istErlaubterHost,
  OAUTH_ANBIETER,
  type OAuthAnbieter,
} from '../oauth/oauth-anbieter';
import { meldeSicherheit } from '../sicherheit/melden';
import { UserEntity } from '../users/user.entity';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
  type SsoZweck,
} from './anmeldung-sso.entities';
import { AuthService } from './auth.service';
import { type AuthPayload } from './dto/auth.dto';
import { type Identitaet, IdTokenFehler, Schluesselspeicher } from './id-token';

export const SSO_TRANSPORT = Symbol('SSO_TRANSPORT');

const VORGANG_MS = 10 * 60_000;
const EINLOESUNG_MS = 5 * 60_000;

const SCOPES = ['openid', 'email', 'profile'];

export const SSO_FEHLER_CODES = [
  'abgebrochen',
  'nicht_zustande',
  'fehlgeschlagen',
  'anbieter',
  'vorgang',
  'abgelaufen',
  'browser',
  'keine_adresse',
  'konto_vorhanden',
  'kein_konto',
  'anders_verknuepft',
  'fremd_verknuepft',
  'erst_trennen',
] as const;

export type SsoFehlerCode = (typeof SSO_FEHLER_CODES)[number];

export class SsoFehler extends Error {
  constructor(
    readonly code: SsoFehlerCode,
    message: string,
    readonly anbieter?: OAuthAnbieter,
  ) {
    super(message);
  }
}

const NAME: Record<OAuthAnbieter, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

const hash = (wert: string): string =>
  createHash('sha256').update(wert).digest('hex');

const zufall = (bytes: number): string =>
  randomBytes(bytes).toString('base64url');

const gleich = (a: string, b: string): boolean => {
  const links = Buffer.from(a);
  const rechts = Buffer.from(b);

  return links.length === rechts.length && timingSafeEqual(links, rechts);
};

const SEITE: Record<SsoZweck, string> = {
  anmelden: '/anmelden',
  registrieren: '/registrieren',
  verknuepfen: '/team',
};

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly schluessel: Schluesselspeicher;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @Inject(SSO_TRANSPORT) private readonly transport: Transport,
  ) {
    this.schluessel = new Schluesselspeicher(transport);
  }

  private einstellungen(): {
    apiOrigin: string;
    webOrigin: string;
    google: AnbieterZugang;
    microsoft: AnbieterZugang;
  } {
    const roh = this.config.get<{
      apiOrigin?: string;
      google?: AnbieterZugang;
      microsoft?: AnbieterZugang;
    }>('oauth');

    return {
      apiOrigin: (roh?.apiOrigin ?? '').replace(/\/+$/u, ''),
      webOrigin: (this.config.get<string>('webOrigin') ?? '').replace(
        /\/+$/u,
        '',
      ),
      google: roh?.google ?? { clientId: '', clientSecret: '' },
      microsoft: roh?.microsoft ?? { clientId: '', clientSecret: '' },
    };
  }

  konfiguriert(): OAuthAnbieter[] {
    const e = this.einstellungen();

    return OAUTH_ANBIETER.filter(
      (anbieter) =>
        e[anbieter].clientId !== '' && e[anbieter].clientSecret !== '',
    );
  }

  rueckrufAdresse(): string {
    return `${this.einstellungen().apiOrigin}/oauth/anmelden/rueckruf`;
  }

  private pruefeAnbieter(roh: string): OAuthAnbieter {
    if (!(this.konfiguriert() as string[]).includes(roh)) {
      throw new BadRequestException(
        'Dieser Anbieter ist auf diesem Server nicht eingerichtet.',
      );
    }

    return roh as OAuthAnbieter;
  }

  async starten(eingabe: {
    anbieter: string;
    zweck: SsoZweck;
    userId?: string;
    arbeitsbereich?: string;
    angemeldetBleiben?: boolean;
  }): Promise<{ url: string; bindung: string }> {
    const anbieter = this.pruefeAnbieter(eingabe.anbieter);
    const arbeitsbereich = eingabe.arbeitsbereich?.trim() ?? '';

    if (eingabe.zweck === 'registrieren' && arbeitsbereich === '') {
      throw new BadRequestException(
        'Bitte geben Sie zuerst den Namen Ihres Arbeitsbereichs an.',
      );
    }

    const schluessel = mailSchluessel(this.config);
    const state = zufall(32);
    const bindung = zufall(32);
    const nonce = zufall(32);
    const verifier = zufall(48);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const e = this.einstellungen();
    const daten = anbieterDaten(anbieter, e.microsoft.tenant);
    const vorgaenge = this.dataSource.getRepository(AnmeldeVorgangEntity);

    await vorgaenge.delete({ gueltigBis: LessThan(new Date()) });
    await vorgaenge.save(
      vorgaenge.create({
        stateHash: hash(state),
        bindungHash: hash(bindung),
        nonceHash: hash(nonce),
        anbieter,
        zweck: eingabe.zweck,
        userId:
          eingabe.zweck === 'verknuepfen' ? (eingabe.userId ?? null) : null,
        arbeitsbereich:
          eingabe.zweck === 'registrieren'
            ? arbeitsbereich.slice(0, 120)
            : null,
        angemeldetBleiben:
          eingabe.zweck === 'anmelden'
            ? (eingabe.angemeldetBleiben ?? true)
            : true,
        verifierVersiegelt: seal(verifier, schluessel),
        gueltigBis: new Date(Date.now() + VORGANG_MS),
      }),
    );

    const url = new URL(daten.authUrl);

    url.search = new URLSearchParams({
      client_id: e[anbieter].clientId,
      redirect_uri: this.rueckrufAdresse(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();

    return { url: url.toString(), bindung };
  }

  async zweckVon(state: string): Promise<SsoZweck | null> {
    const vorgang = await this.dataSource
      .getRepository(AnmeldeVorgangEntity)
      .findOne({
        where: { stateHash: hash(state) },
        select: { stateHash: true, zweck: true },
      });

    return vorgang?.zweck ?? null;
  }

  async verwerfen(state: string): Promise<void> {
    await this.dataSource
      .getRepository(AnmeldeVorgangEntity)
      .delete({ stateHash: hash(state) });
  }

  zielFuer(
    zweck: SsoZweck | null,
    ergebnis:
      | { fehler: SsoFehlerCode; anbieter?: OAuthAnbieter }
      | { verknuepft: OAuthAnbieter },
  ): string {
    const ziel = new URL(
      `${this.einstellungen().webOrigin}${SEITE[zweck ?? 'anmelden']}`,
    );

    if ('fehler' in ergebnis) {
      ziel.searchParams.set('sso', 'fehler');
      ziel.searchParams.set('grund', ergebnis.fehler);

      if (ergebnis.anbieter !== undefined) {
        ziel.searchParams.set('anbieter', ergebnis.anbieter);
      }
    } else {
      ziel.searchParams.set('sso', 'verknuepft');
      ziel.searchParams.set('anbieter', ergebnis.verknuepft);
    }

    if (zweck === 'verknuepfen') {
      ziel.hash = 'anmeldemethoden';
    }

    return ziel.toString();
  }

  private async tokenAnfrage(
    url: string,
    rumpf: Record<string, string>,
  ): Promise<HttpAntwort> {
    const ziel = new URL(url);

    if (!istErlaubterHost(ziel)) {
      throw new SsoFehler('anbieter', 'Unerwartete Adresse des Anbieters.');
    }

    try {
      return await this.transport({
        methode: 'POST',
        url: ziel,
        kopf: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        rumpf: new URLSearchParams(rumpf).toString(),
      });
    } catch {
      throw new SsoFehler('anbieter', 'Der Anbieter war nicht erreichbar.');
    }
  }

  async abschliessen(eingabe: {
    state: string;
    code: string;
    bindung: string | null;
  }): Promise<{ ziel: string; einloesung: string | null }> {
    const vorgaenge = this.dataSource.getRepository(AnmeldeVorgangEntity);
    const vorgang = await vorgaenge.findOne({
      where: { stateHash: hash(eingabe.state) },
    });

    if (vorgang === null) {
      throw new SsoFehler(
        'vorgang',
        'Dieser Anmeldevorgang ist unbekannt oder schon benutzt.',
      );
    }

    await vorgaenge.delete({ stateHash: vorgang.stateHash });

    if (vorgang.gueltigBis.getTime() < Date.now()) {
      throw new SsoFehler('abgelaufen', 'Der Anmeldevorgang ist abgelaufen.');
    }

    if (
      eingabe.bindung === null ||
      !gleich(hash(eingabe.bindung), vorgang.bindungHash)
    ) {
      throw new SsoFehler(
        'browser',
        'Der Anmeldevorgang wurde in einem anderen Browser begonnen.',
      );
    }

    const identitaet = await this.identitaet(vorgang, eingabe.code);

    if (vorgang.zweck === 'verknuepfen') {
      if (vorgang.userId === null) {
        throw new SsoFehler('vorgang', 'Der Anmeldevorgang ist unvollständig.');
      }

      await this.verknuepfen(vorgang.userId, identitaet);

      return {
        ziel: this.zielFuer('verknuepfen', { verknuepft: identitaet.anbieter }),
        einloesung: null,
      };
    }

    const user = await this.kontoFuer(vorgang, identitaet);
    const token = zufall(32);
    const einloesung = zufall(32);
    const einloesungen = this.dataSource.getRepository(AnmeldeEinloesungEntity);

    await einloesungen.delete({ gueltigBis: LessThan(new Date()) });
    await einloesungen.save(
      einloesungen.create({
        tokenHash: hash(token),
        bindungHash: hash(einloesung),
        userId: user.id,
        anbieter: identitaet.anbieter,
        angemeldetBleiben: vorgang.angemeldetBleiben,
        gueltigBis: new Date(Date.now() + EINLOESUNG_MS),
      }),
    );

    const ziel = new URL(`${this.einstellungen().webOrigin}/anmelden`);

    ziel.hash = `sso=${token}`;

    return { ziel: ziel.toString(), einloesung };
  }

  private async identitaet(
    vorgang: AnmeldeVorgangEntity,
    code: string,
  ): Promise<Identitaet> {
    const e = this.einstellungen();
    const anbieter = vorgang.anbieter;
    const daten = anbieterDaten(anbieter, e.microsoft.tenant);
    const antwort = await this.tokenAnfrage(daten.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.rueckrufAdresse(),
      client_id: e[anbieter].clientId,
      client_secret: e[anbieter].clientSecret,
      code_verifier: open(
        vorgang.verifierVersiegelt,
        mailSchluessel(this.config),
      ),
    });

    let inhalt: Record<string, unknown>;

    try {
      inhalt = JSON.parse(antwort.rumpf) as Record<string, unknown>;
    } catch {
      throw new SsoFehler(
        'anbieter',
        'Der Anbieter hat unverständlich geantwortet.',
      );
    }

    if (antwort.status < 200 || antwort.status >= 300) {
      throw new SsoFehler(
        'anbieter',
        'Der Anbieter hat die Anmeldung abgelehnt.',
      );
    }

    try {
      return await this.schluessel.pruefe(anbieter, inhalt.id_token, {
        clientId: e[anbieter].clientId,
        nonceHash: vorgang.nonceHash,
        tenant: e.microsoft.tenant,
      });
    } catch (fehler) {
      if (fehler instanceof IdTokenFehler) {
        throw new SsoFehler('anbieter', fehler.message);
      }

      throw fehler;
    }
  }

  private async kontoFuer(
    vorgang: AnmeldeVorgangEntity,
    identitaet: Identitaet,
  ): Promise<UserEntity> {
    const verknuepfungen = this.dataSource.getRepository(
      AnmeldeVerknuepfungEntity,
    );
    const users = this.dataSource.getRepository(UserEntity);
    const name = NAME[identitaet.anbieter];
    const bekannt = await verknuepfungen.findOne({
      where: { anbieter: identitaet.anbieter, subjekt: identitaet.subjekt },
    });

    if (bekannt !== null) {
      await verknuepfungen.update(
        { id: bekannt.id },
        { email: identitaet.email, zuletztAm: new Date() },
      );

      return users.findOneOrFail({ where: { id: bekannt.userId } });
    }

    if (identitaet.email === null) {
      throw new SsoFehler(
        'keine_adresse',
        `${name} hat keine E-Mail-Adresse genannt.`,
        identitaet.anbieter,
      );
    }

    const vorhanden = await users.findOne({
      where: { email: identitaet.email },
    });

    if (vorhanden !== null) {
      if (!identitaet.emailBestaetigt || vorhanden.emailVerifiedAt === null) {
        throw new SsoFehler(
          'konto_vorhanden',
          `Zu ${identitaet.email} gibt es schon ein Stegwerk-Konto; ${name} wird nicht über die Adresse verknüpft.`,
          identitaet.anbieter,
        );
      }

      const schonAndere = await verknuepfungen.findOne({
        where: { userId: vorhanden.id, anbieter: identitaet.anbieter },
      });

      if (schonAndere !== null) {
        throw new SsoFehler(
          'anders_verknuepft',
          `Das Stegwerk-Konto ist schon mit einem anderen ${name}-Konto verknüpft.`,
          identitaet.anbieter,
        );
      }

      await this.verknuepfungAnlegen(vorhanden.id, identitaet);

      return vorhanden;
    }

    if (vorgang.zweck !== 'registrieren' || vorgang.arbeitsbereich === null) {
      throw new SsoFehler(
        'kein_konto',
        `Zu ${identitaet.email} gibt es noch kein Stegwerk-Konto.`,
        identitaet.anbieter,
      );
    }

    const { user } = await this.auth.kontoAnlegen({
      email: identitaet.email,
      passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 12),
      passwortGesetzt: false,
      firstName: identitaet.vorname,
      lastName: identitaet.nachname,
      workspaceName: vorgang.arbeitsbereich,
      emailVerifiedAt: identitaet.emailBestaetigt ? new Date() : null,
    });

    await this.verknuepfungAnlegen(user.id, identitaet, true);

    if (!identitaet.emailBestaetigt) {
      await this.auth.bestaetigungSenden(user.id);
    }

    return user;
  }

  private async verknuepfungAnlegen(
    userId: string,
    identitaet: Identitaet,
    neuesKonto = false,
  ): Promise<void> {
    const verknuepfungen = this.dataSource.getRepository(
      AnmeldeVerknuepfungEntity,
    );

    await verknuepfungen.save(
      verknuepfungen.create({
        userId,
        anbieter: identitaet.anbieter,
        subjekt: identitaet.subjekt,
        email: identitaet.email,
        zuletztAm: new Date(),
      }),
    );

    meldeSicherheit({
      art: 'sso_verknuepft',
      userId,
      actorId: userId,
      details: { anbieter: identitaet.anbieter, neuesKonto },
    });
  }

  private async verknuepfen(
    userId: string,
    identitaet: Identitaet,
  ): Promise<void> {
    const verknuepfungen = this.dataSource.getRepository(
      AnmeldeVerknuepfungEntity,
    );
    const name = NAME[identitaet.anbieter];
    const bekannt = await verknuepfungen.findOne({
      where: { anbieter: identitaet.anbieter, subjekt: identitaet.subjekt },
    });

    if (bekannt !== null) {
      if (bekannt.userId !== userId) {
        throw new SsoFehler(
          'fremd_verknuepft',
          `Dieses ${name}-Konto gehört schon zu einem anderen Stegwerk-Konto.`,
          identitaet.anbieter,
        );
      }

      await verknuepfungen.update(
        { id: bekannt.id },
        { email: identitaet.email, zuletztAm: new Date() },
      );

      return;
    }

    const eigene = await verknuepfungen.findOne({
      where: { userId, anbieter: identitaet.anbieter },
    });

    if (eigene !== null) {
      throw new SsoFehler(
        'erst_trennen',
        `Das Konto ist schon mit einem anderen ${name}-Konto verknüpft; erst trennen.`,
        identitaet.anbieter,
      );
    }

    await this.verknuepfungAnlegen(userId, identitaet);
  }

  async einloesen(
    token: string,
    bindung: string | null,
    totpCode?: string,
  ): Promise<AuthPayload> {
    const einloesungen = this.dataSource.getRepository(AnmeldeEinloesungEntity);
    const eintrag = await einloesungen.findOne({
      where: { tokenHash: hash(token) },
    });

    if (eintrag === null || eintrag.gueltigBis.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Die Anmeldung ist abgelaufen. Bitte noch einmal anmelden.',
      );
    }

    if (bindung === null || !gleich(hash(bindung), eintrag.bindungHash)) {
      throw new UnauthorizedException(
        'Diese Anmeldung wurde in einem anderen Browser begonnen. Bitte melden Sie sich hier noch einmal an.',
      );
    }

    const verknuepft = await this.dataSource
      .getRepository(AnmeldeVerknuepfungEntity)
      .exists({
        where: { userId: eintrag.userId, anbieter: eintrag.anbieter },
      });

    if (!verknuepft) {
      await einloesungen.delete({ tokenHash: eintrag.tokenHash });
      throw new UnauthorizedException(
        'Die Anmeldung ist abgelaufen. Bitte noch einmal anmelden.',
      );
    }

    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { id: eintrag.userId } });

    const payload = await this.auth.anmeldungAbschliessen(
      user,
      { totpCode, angemeldetBleiben: eintrag.angemeldetBleiben },
      eintrag.anbieter,
    );

    await einloesungen.delete({ tokenHash: eintrag.tokenHash });

    return payload;
  }

  verknuepfungenVon(userId: string): Promise<AnmeldeVerknuepfungEntity[]> {
    return this.dataSource
      .getRepository(AnmeldeVerknuepfungEntity)
      .find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async verknuepfenErlaubt(userId: string, passwort?: string): Promise<void> {
    const konto = await this.dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { id: userId } });

    if (konto.emailVerifiedAt === null) {
      throw new BadRequestException(
        'Bestätigen Sie zuerst Ihre E-Mail-Adresse.',
      );
    }

    if (
      konto.passwortGesetzt &&
      !(await bcrypt.compare(passwort ?? '', konto.passwordHash))
    ) {
      throw new BadRequestException('Das Passwort stimmt nicht.');
    }
  }

  async trennen(userId: string, anbieter: string): Promise<void> {
    const verknuepfungen = this.dataSource.getRepository(
      AnmeldeVerknuepfungEntity,
    );
    const alle = await verknuepfungen.find({ where: { userId } });
    const diese = alle.find((v) => v.anbieter === anbieter);

    if (diese === undefined) {
      throw new BadRequestException('Diese Verknüpfung gibt es nicht.');
    }

    const konto = await this.dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { id: userId } });

    if (!konto.passwortGesetzt && alle.length === 1) {
      throw new BadRequestException(
        'Das ist Ihr einziger Weg ins Konto. Legen Sie zuerst ein Passwort fest.',
      );
    }

    await verknuepfungen.delete({ id: diese.id });
    await this.dataSource
      .getRepository(AnmeldeEinloesungEntity)
      .delete({ userId, anbieter: diese.anbieter });
    await this.dataSource
      .getRepository(AnmeldeVorgangEntity)
      .delete({ userId, anbieter: diese.anbieter });
    meldeSicherheit({
      art: 'sso_getrennt',
      userId,
      actorId: userId,
      details: { anbieter: diese.anbieter },
    });
    this.logger.log(`Anmeldung über ${diese.anbieter} getrennt (${userId})`);
  }
}
