import {
  createHash,
  createPublicKey,
  type JsonWebKey,
  timingSafeEqual,
  verify,
} from 'node:crypto';

import { type Transport } from '../kalender-sync/caldav-client';
import { istErlaubterHost, type OAuthAnbieter } from '../oauth/oauth-anbieter';

export const JWKS_URL: Record<OAuthAnbieter, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  microsoft: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
};

export const MICROSOFT_PRIVAT = '9188040d-6c67-4c5b-b112-36a304b66dad';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const SPIELRAUM_S = 300;

export class IdTokenFehler extends Error {}

const gleicherHash = (wert: string, erwartet: string): boolean => {
  const links = Buffer.from(createHash('sha256').update(wert).digest('hex'));
  const rechts = Buffer.from(erwartet);

  return links.length === rechts.length && timingSafeEqual(links, rechts);
};

export type Identitaet = {
  anbieter: OAuthAnbieter;
  subjekt: string;
  email: string | null;
  emailBestaetigt: boolean;
  vorname: string;
  nachname: string;
};

type Zerlegt = {
  kopf: Record<string, unknown>;
  inhalt: Record<string, unknown>;
  signiert: Buffer;
  signatur: Buffer;
};

const json = (teil: string): Record<string, unknown> => {
  const wert: unknown = JSON.parse(
    Buffer.from(teil, 'base64url').toString('utf8'),
  );

  if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) {
    throw new Error('kein Objekt');
  }

  return wert as Record<string, unknown>;
};

export const zerlege = (token: unknown): Zerlegt => {
  if (typeof token !== 'string' || token.length > 16_000) {
    throw new IdTokenFehler(
      'Der Anbieter hat kein gültiges id_token geschickt.',
    );
  }

  const teile = token.split('.');

  if (teile.length !== 3 || teile.some((teil) => teil === '')) {
    throw new IdTokenFehler(
      'Der Anbieter hat kein gültiges id_token geschickt.',
    );
  }

  try {
    return {
      kopf: json(teile[0]),
      inhalt: json(teile[1]),
      signiert: Buffer.from(`${teile[0]}.${teile[1]}`),
      signatur: Buffer.from(teile[2], 'base64url'),
    };
  } catch {
    throw new IdTokenFehler(
      'Der Anbieter hat kein gültiges id_token geschickt.',
    );
  }
};

export const signaturStimmt = (zerlegt: Zerlegt, jwk: JsonWebKey): boolean => {
  if (zerlegt.kopf.alg !== 'RS256' || jwk.kty !== 'RSA') {
    return false;
  }

  try {
    const schluessel = createPublicKey({ key: jwk, format: 'jwk' });

    return verify('RSA-SHA256', zerlegt.signiert, schluessel, zerlegt.signatur);
  } catch {
    return false;
  }
};

const text = (wert: unknown, laenge: number): string =>
  typeof wert === 'string' ? wert.trim().slice(0, laenge) : '';

const namen = (
  inhalt: Record<string, unknown>,
  email: string | null,
): { vorname: string; nachname: string } => {
  const vorname = text(inhalt.given_name, 100);
  const nachname = text(inhalt.family_name, 100);

  if (vorname !== '') {
    return { vorname, nachname };
  }

  const ganz = text(inhalt.name, 200).split(/\s+/u).filter(Boolean);

  if (ganz.length > 0) {
    return {
      vorname: ganz[0].slice(0, 100),
      nachname: (nachname || ganz.slice(1).join(' ')).slice(0, 100),
    };
  }

  return { vorname: (email ?? 'Neu').split('@')[0].slice(0, 100), nachname };
};

const adresse = (wert: unknown): string | null => {
  const roh = text(wert, 320).toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(roh) ? roh : null;
};

export const pruefeAnsprueche = (
  anbieter: OAuthAnbieter,
  inhalt: Record<string, unknown>,
  erwartung: {
    clientId: string;
    nonceHash: string;
    tenant?: string;
    jetzt?: number;
  },
): Identitaet => {
  const jetzt = Math.floor((erwartung.jetzt ?? Date.now()) / 1000);
  const aud = inhalt.aud;
  const empfaenger = Array.isArray(aud) ? aud : [aud];

  if (!empfaenger.includes(erwartung.clientId)) {
    throw new IdTokenFehler('Das Token ist nicht für Stegwerk ausgestellt.');
  }

  if (
    typeof inhalt.exp !== 'number' ||
    inhalt.exp + SPIELRAUM_S < jetzt ||
    (typeof inhalt.iat === 'number' && inhalt.iat - SPIELRAUM_S > jetzt)
  ) {
    throw new IdTokenFehler('Das Token des Anbieters ist abgelaufen.');
  }

  if (
    typeof inhalt.nonce !== 'string' ||
    !gleicherHash(inhalt.nonce, erwartung.nonceHash)
  ) {
    throw new IdTokenFehler('Das Token gehört nicht zu dieser Anmeldung.');
  }

  if (anbieter === 'google') {
    if (
      inhalt.iss !== 'https://accounts.google.com' &&
      inhalt.iss !== 'accounts.google.com'
    ) {
      throw new IdTokenFehler('Unerwarteter Aussteller des Tokens.');
    }

    const sub = text(inhalt.sub, 255);

    if (sub === '') {
      throw new IdTokenFehler('Der Anbieter hat keine Kennung genannt.');
    }

    const email = adresse(inhalt.email);

    return {
      anbieter,
      subjekt: sub,
      email,
      emailBestaetigt:
        email !== null &&
        (inhalt.email_verified === true || inhalt.email_verified === 'true'),
      ...namen(inhalt, email),
    };
  }

  const tid = text(inhalt.tid, 64).toLowerCase();
  const oid = text(inhalt.oid, 64).toLowerCase();

  if (!GUID.test(tid) || !GUID.test(oid)) {
    throw new IdTokenFehler('Der Anbieter hat keine Kennung genannt.');
  }

  if (inhalt.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
    throw new IdTokenFehler('Unerwarteter Aussteller des Tokens.');
  }

  const tenant = (erwartung.tenant ?? 'common').toLowerCase();

  if (
    (GUID.test(tenant) && tid !== tenant) ||
    (tenant === 'organizations' && tid === MICROSOFT_PRIVAT) ||
    (tenant === 'consumers' && tid !== MICROSOFT_PRIVAT)
  ) {
    throw new IdTokenFehler(
      'Mit diesem Microsoft-Konto ist die Anmeldung hier nicht vorgesehen.',
    );
  }

  const email = adresse(inhalt.email) ?? adresse(inhalt.preferred_username);

  return {
    anbieter,
    subjekt: `${tid}:${oid}`,
    email,
    emailBestaetigt: false,
    ...namen(inhalt, email),
  };
};

export class Schluesselspeicher {
  private readonly speicher = new Map<
    OAuthAnbieter,
    { schluessel: JsonWebKey[]; bis: number }
  >();

  constructor(
    private readonly transport: Transport,
    private readonly dauerMs = 60 * 60_000,
  ) {}

  private async laden(anbieter: OAuthAnbieter): Promise<JsonWebKey[]> {
    const url = new URL(JWKS_URL[anbieter]);

    if (!istErlaubterHost(url)) {
      throw new IdTokenFehler('Unerwartete Adresse des Anbieters.');
    }

    let schluessel: JsonWebKey[] = [];

    try {
      const antwort = await this.transport({
        methode: 'GET',
        url,
        kopf: { accept: 'application/json' },
      });
      const inhalt = JSON.parse(antwort.rumpf) as { keys?: unknown };

      if (antwort.status === 200 && Array.isArray(inhalt.keys)) {
        schluessel = inhalt.keys.filter(
          (k): k is JsonWebKey => typeof k === 'object' && k !== null,
        );
      }
    } catch {
      throw new IdTokenFehler('Der Anbieter war nicht erreichbar.');
    }

    if (schluessel.length === 0) {
      throw new IdTokenFehler('Der Anbieter hat keine Schlüssel genannt.');
    }

    this.speicher.set(anbieter, {
      schluessel,
      bis: Date.now() + this.dauerMs,
    });

    return schluessel;
  }

  async schluessel(
    anbieter: OAuthAnbieter,
    kid: string,
  ): Promise<JsonWebKey | null> {
    const finde = (liste: JsonWebKey[]) =>
      liste.find((k) => (k as { kid?: unknown }).kid === kid) ?? null;
    const vorhanden = this.speicher.get(anbieter);

    if (vorhanden !== undefined && vorhanden.bis > Date.now()) {
      const treffer = finde(vorhanden.schluessel);

      if (treffer !== null) {
        return treffer;
      }
    }

    return finde(await this.laden(anbieter));
  }

  async pruefe(
    anbieter: OAuthAnbieter,
    token: unknown,
    erwartung: Parameters<typeof pruefeAnsprueche>[2],
  ): Promise<Identitaet> {
    const zerlegt = zerlege(token);
    const kid = zerlegt.kopf.kid;

    if (typeof kid !== 'string' || kid === '') {
      throw new IdTokenFehler('Das Token des Anbieters ist nicht signiert.');
    }

    const jwk = await this.schluessel(anbieter, kid);

    if (jwk === null || !signaturStimmt(zerlegt, jwk)) {
      throw new IdTokenFehler(
        'Die Signatur des Tokens ließ sich nicht bestätigen.',
      );
    }

    return pruefeAnsprueche(anbieter, zerlegt.inhalt, erwartung);
  }
}
