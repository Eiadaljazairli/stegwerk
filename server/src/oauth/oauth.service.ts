import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import {
  type HttpAntwort,
  type Transport,
} from '../kalender-sync/caldav-client';
import {
  mailSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import {
  type AnbieterZugang,
  anbieterDaten,
  istErlaubterHost,
  OAUTH_ANBIETER,
  OAUTH_ZWECKE,
  type OAuthAnbieter,
  type OAuthZweck,
  POSTFACH_VORGANG_ARTEN,
  type PostfachVorgangArt,
} from './oauth-anbieter';
import { OAuthVorgangEntity } from './oauth-vorgang.entity';
import { OAuthZugangEntity } from './oauth-zugang.entity';

export const OAUTH_TRANSPORT = Symbol('OAUTH_TRANSPORT');

const VORGANG_MS = 10 * 60_000;
const PUFFER_MS = 60_000;

export type OAuthEinstellungen = {
  apiOrigin: string;
  google: AnbieterZugang;
  microsoft: AnbieterZugang;
};

export class OAuthFehler extends Error {}

export class OAuthWiderrufen extends OAuthFehler {
  constructor() {
    super(
      'Der Zugriff wurde beim Anbieter widerrufen oder ist abgelaufen. Bitte neu verbinden.',
    );
  }
}

export type AbgeschlossenerVorgang = {
  workspaceId: string;
  userId: string;
  anbieter: OAuthAnbieter;
  zweck: OAuthZweck;
  postfachArt: PostfachVorgangArt | null;
  zugang: OAuthZugangEntity;
  zugriff: string;
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

export const kontoAusIdToken = (idToken: unknown): string | null => {
  if (typeof idToken !== 'string') {
    return null;
  }

  const teile = idToken.split('.');

  if (teile.length < 2) {
    return null;
  }

  try {
    const inhalt = JSON.parse(
      Buffer.from(teile[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const adresse = [inhalt.email, inhalt.preferred_username, inhalt.upn].find(
      (wert): wert is string => typeof wert === 'string' && wert.includes('@'),
    );

    return adresse?.toLowerCase().slice(0, 320) ?? null;
  } catch {
    return null;
  }
};

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly laufend = new Map<string, Promise<string>>();

  constructor(
    @InjectRepository(OAuthZugangEntity)
    private readonly zugaenge: Repository<OAuthZugangEntity>,
    @InjectRepository(OAuthVorgangEntity)
    private readonly vorgaenge: Repository<OAuthVorgangEntity>,
    private readonly config: ConfigService,
    @Inject(OAUTH_TRANSPORT) private readonly transport: Transport,
  ) {}

  private einstellungen(): OAuthEinstellungen {
    const roh = this.config.get<OAuthEinstellungen>('oauth');

    return {
      apiOrigin: roh?.apiOrigin ?? '',
      google: roh?.google ?? { clientId: '', clientSecret: '' },
      microsoft: roh?.microsoft ?? { clientId: '', clientSecret: '' },
    };
  }

  private schluessel(): Schluesselbund {
    return mailSchluessel(this.config);
  }

  konfiguriert(): OAuthAnbieter[] {
    const e = this.einstellungen();

    return OAUTH_ANBIETER.filter(
      (anbieter) =>
        e[anbieter].clientId !== '' && e[anbieter].clientSecret !== '',
    );
  }

  rueckrufAdresse(): string {
    return `${this.einstellungen().apiOrigin.replace(/\/+$/u, '')}/oauth/rueckruf`;
  }

  private pruefeAnbieter(
    anbieter: string,
    zweck: string,
  ): {
    anbieter: OAuthAnbieter;
    zweck: OAuthZweck;
  } {
    if (!(OAUTH_ZWECKE as readonly string[]).includes(zweck)) {
      throw new BadRequestException('Unbekannter Zweck.');
    }

    if (!(this.konfiguriert() as string[]).includes(anbieter)) {
      throw new BadRequestException(
        'Dieser Anbieter ist auf diesem Server nicht eingerichtet.',
      );
    }

    return {
      anbieter: anbieter as OAuthAnbieter,
      zweck: zweck as OAuthZweck,
    };
  }

  async starten(
    caller: RequestUser,
    anbieterRoh: string,
    zweckRoh: string,
    postfachArtRoh: string | null = null,
  ): Promise<{ url: string; bindung: string }> {
    if (caller.apiKey !== undefined) {
      throw new ForbiddenException(
        'Verbinden kann nur eine Person, kein Schlüssel.',
      );
    }

    const { anbieter, zweck } = this.pruefeAnbieter(anbieterRoh, zweckRoh);

    if (
      postfachArtRoh !== null &&
      (zweck !== 'postfach' ||
        !(POSTFACH_VORGANG_ARTEN as readonly string[]).includes(postfachArtRoh))
    ) {
      throw new BadRequestException('Unbekannte Art des Postfachs.');
    }

    const postfachArt = postfachArtRoh as PostfachVorgangArt | null;
    const schluessel = this.schluessel();
    const state = zufall(32);
    const bindung = zufall(32);
    const verifier = zufall(48);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const e = this.einstellungen();
    const daten = anbieterDaten(anbieter, e.microsoft.tenant);

    await this.vorgaenge.delete({ gueltigBis: LessThan(new Date()) });
    await this.vorgaenge.save(
      this.vorgaenge.create({
        stateHash: hash(state),
        bindungHash: hash(bindung),
        workspaceId: caller.workspaceId,
        userId: caller.userId,
        anbieter,
        zweck,
        postfachArt,
        verifierVersiegelt: seal(verifier, schluessel),
        gueltigBis: new Date(Date.now() + VORGANG_MS),
      }),
    );

    const url = new URL(daten.authUrl);

    url.search = new URLSearchParams({
      client_id: e[anbieter].clientId,
      redirect_uri: this.rueckrufAdresse(),
      response_type: 'code',
      scope: daten.scopes[zweck].join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...daten.extra,
    }).toString();

    return { url: url.toString(), bindung };
  }

  async zweckVon(state: string): Promise<OAuthZweck | null> {
    const vorgang = await this.vorgaenge.findOne({
      where: { stateHash: hash(state) },
      select: { stateHash: true, zweck: true },
    });

    return vorgang?.zweck ?? null;
  }

  async verwerfen(state: string): Promise<void> {
    await this.vorgaenge.delete({ stateHash: hash(state) });
  }

  private async anfrage(
    url: string,
    rumpf: Record<string, string>,
  ): Promise<HttpAntwort> {
    const ziel = new URL(url);

    if (!istErlaubterHost(ziel)) {
      throw new OAuthFehler('Unerwartete Adresse des Anbieters.');
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
      throw new OAuthFehler('Der Anbieter war nicht erreichbar.');
    }
  }

  async abschliessen(eingabe: {
    state: string;
    code: string;
    bindung: string | null;
  }): Promise<AbgeschlossenerVorgang> {
    const vorgang = await this.vorgaenge.findOne({
      where: { stateHash: hash(eingabe.state) },
    });

    if (vorgang === null) {
      throw new OAuthFehler(
        'Dieser Anmeldevorgang ist unbekannt oder schon benutzt.',
      );
    }

    await this.vorgaenge.delete({ stateHash: vorgang.stateHash });

    if (vorgang.gueltigBis.getTime() < Date.now()) {
      throw new OAuthFehler('Der Anmeldevorgang ist abgelaufen.');
    }

    if (
      eingabe.bindung === null ||
      !gleich(hash(eingabe.bindung), vorgang.bindungHash)
    ) {
      throw new OAuthFehler(
        'Der Anmeldevorgang wurde in einem anderen Browser begonnen.',
      );
    }

    const schluessel = this.schluessel();
    const e = this.einstellungen();
    const anbieter = vorgang.anbieter;
    const daten = anbieterDaten(anbieter, e.microsoft.tenant);
    const antwort = await this.anfrage(daten.tokenUrl, {
      grant_type: 'authorization_code',
      code: eingabe.code,
      redirect_uri: this.rueckrufAdresse(),
      client_id: e[anbieter].clientId,
      client_secret: e[anbieter].clientSecret,
      code_verifier: open(vorgang.verifierVersiegelt, schluessel),
    });
    const tokens = this.tokens(antwort);

    if (tokens.refresh === null) {
      throw new OAuthFehler(
        'Der Anbieter hat keinen dauerhaften Zugang erteilt. Bitte erneut verbinden und alle Berechtigungen bestätigen.',
      );
    }

    const konto = kontoAusIdToken(tokens.idToken);

    if (konto === null) {
      throw new OAuthFehler('Der Anbieter hat keine E-Mail-Adresse genannt.');
    }

    const vorher = await this.zugaenge.findOne({
      where: {
        workspaceId: vorgang.workspaceId,
        userId: vorgang.userId,
        zweck: vorgang.zweck,
        ...(vorgang.zweck === 'postfach' ? { konto } : {}),
      },
    });
    const zugang = await this.zugaenge.save(
      this.zugaenge.create({
        ...(vorher ?? {}),
        workspaceId: vorgang.workspaceId,
        userId: vorgang.userId,
        anbieter,
        zweck: vorgang.zweck,
        konto,
        erneuerungVersiegelt: seal(tokens.refresh, schluessel),
        zugriffVersiegelt: seal(tokens.access, schluessel),
        zugriffBis: new Date(Date.now() + tokens.sekunden * 1000),
        widerrufenAm: null,
      }),
    );

    return {
      workspaceId: vorgang.workspaceId,
      userId: vorgang.userId,
      anbieter,
      zweck: vorgang.zweck,
      postfachArt: vorgang.postfachArt ?? null,
      zugang,
      zugriff: tokens.access,
    };
  }

  private tokens(antwort: HttpAntwort): {
    access: string;
    refresh: string | null;
    idToken: unknown;
    sekunden: number;
  } {
    let inhalt: Record<string, unknown>;

    try {
      inhalt = JSON.parse(antwort.rumpf) as Record<string, unknown>;
    } catch {
      throw new OAuthFehler('Der Anbieter hat unverständlich geantwortet.');
    }

    if (antwort.status === 400 && inhalt.error === 'invalid_grant') {
      throw new OAuthWiderrufen();
    }

    if (
      antwort.status < 200 ||
      antwort.status >= 300 ||
      typeof inhalt.access_token !== 'string'
    ) {
      throw new OAuthFehler('Der Anbieter hat die Anmeldung abgelehnt.');
    }

    const sekunden = Number(inhalt.expires_in);

    return {
      access: inhalt.access_token,
      refresh:
        typeof inhalt.refresh_token === 'string' ? inhalt.refresh_token : null,
      idToken: inhalt.id_token,
      sekunden: Number.isFinite(sekunden) && sekunden > 0 ? sekunden : 3600,
    };
  }

  async zugang(id: string): Promise<OAuthZugangEntity | null> {
    return this.zugaenge.findOne({ where: { id } });
  }

  zugriffstoken(zugangId: string): Promise<string> {
    const laeuft = this.laufend.get(zugangId);

    if (laeuft !== undefined) {
      return laeuft;
    }

    const versuch = this.holen(zugangId).finally(() =>
      this.laufend.delete(zugangId),
    );

    this.laufend.set(zugangId, versuch);

    return versuch;
  }

  private async holen(zugangId: string): Promise<string> {
    const zugang = await this.zugang(zugangId);

    if (zugang === null || zugang.widerrufenAm !== null) {
      throw new OAuthWiderrufen();
    }

    const schluessel = this.schluessel();

    if (
      zugang.zugriffVersiegelt !== null &&
      zugang.zugriffBis !== null &&
      zugang.zugriffBis.getTime() - PUFFER_MS > Date.now()
    ) {
      return open(zugang.zugriffVersiegelt, schluessel);
    }

    const e = this.einstellungen();
    const daten = anbieterDaten(zugang.anbieter, e.microsoft.tenant);
    let tokens: ReturnType<OAuthService['tokens']>;

    try {
      tokens = this.tokens(
        await this.anfrage(daten.tokenUrl, {
          grant_type: 'refresh_token',
          refresh_token: open(zugang.erneuerungVersiegelt, schluessel),
          client_id: e[zugang.anbieter].clientId,
          client_secret: e[zugang.anbieter].clientSecret,
        }),
      );
    } catch (fehler) {
      if (fehler instanceof OAuthWiderrufen) {
        await this.zugaenge.update(
          { id: zugang.id },
          { widerrufenAm: new Date(), zugriffVersiegelt: null },
        );
      }

      throw fehler;
    }

    await this.zugaenge.update(
      { id: zugang.id },
      {
        zugriffVersiegelt: seal(tokens.access, schluessel),
        zugriffBis: new Date(Date.now() + tokens.sekunden * 1000),
        ...(tokens.refresh === null
          ? {}
          : { erneuerungVersiegelt: seal(tokens.refresh, schluessel) }),
      },
    );

    return tokens.access;
  }

  async entfernen(zugangId: string | null): Promise<void> {
    if (zugangId === null) {
      return;
    }

    const zugang = await this.zugang(zugangId);

    if (zugang === null) {
      return;
    }

    const revoke = anbieterDaten(zugang.anbieter).revokeUrl;

    if (revoke !== null) {
      try {
        await this.anfrage(revoke, {
          token: open(zugang.erneuerungVersiegelt, this.schluessel()),
        });
      } catch (fehler) {
        this.logger.warn(
          `Zugang bei ${zugang.anbieter} nicht zurückgegeben: ${
            fehler instanceof Error ? fehler.message : String(fehler)
          }`,
        );
      }
    }

    await this.zugaenge.delete({ id: zugang.id });
  }
}
