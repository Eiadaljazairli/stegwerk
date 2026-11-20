import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { type HttpAnfrage } from '../kalender-sync/caldav-client';
import {
  IdTokenFehler,
  MICROSOFT_PRIVAT,
  pruefeAnsprueche,
  Schluesselspeicher,
} from './id-token';

const nonceHash = (nonce: string) =>
  createHash('sha256').update(nonce).digest('hex');

const JETZT = Date.UTC(2026, 9, 27, 12, 0, 0);
const S = Math.floor(JETZT / 1000);
const TID = '11111111-2222-3333-4444-555555555555';
const OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const google = (mehr: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: 'google-client',
  sub: '1234567890',
  email: 'Ada@Example.de',
  email_verified: true,
  given_name: 'Ada',
  family_name: 'Lovelace',
  nonce: 'n-1',
  iat: S,
  exp: S + 3600,
  ...mehr,
});

const microsoft = (mehr: Record<string, unknown> = {}) => ({
  iss: `https://login.microsoftonline.com/${TID}/v2.0`,
  aud: 'ms-client',
  tid: TID,
  oid: OID,
  email: 'max@firma.de',
  name: 'Max Muster Mann',
  nonce: 'n-1',
  iat: S,
  exp: S + 3600,
  ...mehr,
});

const gErwartung = {
  clientId: 'google-client',
  nonceHash: nonceHash('n-1'),
  jetzt: JETZT,
};
const mErwartung = {
  clientId: 'ms-client',
  nonceHash: nonceHash('n-1'),
  jetzt: JETZT,
};

describe('pruefeAnsprueche', () => {
  it('liest Google mit bestätigter Adresse, klein geschrieben', () => {
    expect(pruefeAnsprueche('google', google(), gErwartung)).toEqual({
      anbieter: 'google',
      subjekt: '1234567890',
      email: 'ada@example.de',
      emailBestaetigt: true,
      vorname: 'Ada',
      nachname: 'Lovelace',
    });
  });

  it('nimmt eine Google-Adresse ohne email_verified nicht als bestätigt', () => {
    expect(
      pruefeAnsprueche('google', google({ email_verified: false }), gErwartung)
        .emailBestaetigt,
    ).toBe(false);
  });

  it('lehnt fremden Empfänger, falsche nonce, Ablauf und Aussteller ab', () => {
    expect(() =>
      pruefeAnsprueche('google', google({ aud: 'andere-app' }), gErwartung),
    ).toThrow(IdTokenFehler);
    expect(() =>
      pruefeAnsprueche('google', google({ nonce: 'n-2' }), gErwartung),
    ).toThrow('gehört nicht zu dieser Anmeldung');
    expect(() =>
      pruefeAnsprueche('google', google({ exp: S - 3600 }), gErwartung),
    ).toThrow('abgelaufen');
    expect(() =>
      pruefeAnsprueche(
        'google',
        google({ iss: 'https://evil.example' }),
        gErwartung,
      ),
    ).toThrow('Aussteller');
  });

  it('nimmt aud auch als Liste', () => {
    expect(
      pruefeAnsprueche(
        'google',
        google({ aud: ['x', 'google-client'] }),
        gErwartung,
      ).subjekt,
    ).toBe('1234567890');
  });

  it('erkennt Microsoft an Mandant und Objekt, nie an der Adresse', () => {
    const wer = pruefeAnsprueche('microsoft', microsoft(), mErwartung);

    expect(wer.subjekt).toBe(`${TID}:${OID}`);
    expect(wer.emailBestaetigt).toBe(false);
    expect(wer.vorname).toBe('Max');
    expect(wer.nachname).toBe('Muster Mann');
  });

  it('verlangt bei Microsoft den Aussteller des eigenen Mandanten', () => {
    expect(() =>
      pruefeAnsprueche(
        'microsoft',
        microsoft({ iss: 'https://login.microsoftonline.com/common/v2.0' }),
        mErwartung,
      ),
    ).toThrow('Aussteller');
  });

  it('hält sich an MICROSOFT_TENANT', () => {
    const privat = microsoft({
      tid: MICROSOFT_PRIVAT,
      iss: `https://login.microsoftonline.com/${MICROSOFT_PRIVAT}/v2.0`,
    });

    expect(() =>
      pruefeAnsprueche('microsoft', privat, {
        ...mErwartung,
        tenant: 'organizations',
      }),
    ).toThrow('nicht vorgesehen');
    expect(() =>
      pruefeAnsprueche('microsoft', microsoft(), {
        ...mErwartung,
        tenant: '99999999-2222-3333-4444-555555555555',
      }),
    ).toThrow('nicht vorgesehen');
    expect(
      pruefeAnsprueche('microsoft', microsoft(), { ...mErwartung, tenant: TID })
        .subjekt,
    ).toContain(OID);
  });

  it('nimmt preferred_username, wenn email fehlt', () => {
    expect(
      pruefeAnsprueche(
        'microsoft',
        microsoft({ email: undefined, preferred_username: 'Max@Firma.de' }),
        mErwartung,
      ).email,
    ).toBe('max@firma.de');
  });
});

describe('Schluesselspeicher', () => {
  const paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fremd = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...paar.publicKey.export({ format: 'jwk' }), kid: 'k1' };

  const jwt = (
    inhalt: Record<string, unknown>,
    schluessel = paar.privateKey,
    kopf: Record<string, unknown> = { alg: 'RS256', kid: 'k1' },
  ) => {
    const teile = [kopf, inhalt].map((teil) =>
      Buffer.from(JSON.stringify(teil)).toString('base64url'),
    );
    const signatur = sign(
      'RSA-SHA256',
      Buffer.from(teile.join('.')),
      schluessel,
    ).toString('base64url');

    return [...teile, signatur].join('.');
  };

  const anfragen: HttpAnfrage[] = [];
  const speicher = new Schluesselspeicher((anfrage) => {
    anfragen.push(anfrage);

    return Promise.resolve({
      status: 200,
      kopf: {},
      rumpf: JSON.stringify({ keys: [jwk] }),
    });
  });

  const jetztErwartung = { ...gErwartung, jetzt: Date.now() };
  const frisch = () =>
    google({
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });

  it('prüft die Signatur gegen die Schlüssel des Anbieters', async () => {
    await expect(
      speicher.pruefe('google', jwt(frisch()), jetztErwartung),
    ).resolves.toMatchObject({ subjekt: '1234567890' });
    expect(anfragen[0].url.hostname).toBe('www.googleapis.com');
  });

  it('lädt die Schlüssel nur einmal je Stunde', async () => {
    const vorher = anfragen.length;

    await speicher.pruefe('google', jwt(frisch()), jetztErwartung);
    expect(anfragen.length).toBe(vorher);
  });

  it('lehnt ein Token mit fremdem Schlüssel ab', async () => {
    await expect(
      speicher.pruefe(
        'google',
        jwt(frisch(), fremd.privateKey),
        jetztErwartung,
      ),
    ).rejects.toThrow('Signatur');
  });

  it('lehnt alg none und unbekannte kid ab', async () => {
    await expect(
      speicher.pruefe(
        'google',
        jwt(frisch(), paar.privateKey, { alg: 'none', kid: 'k1' }),
        jetztErwartung,
      ),
    ).rejects.toThrow(IdTokenFehler);
    await expect(
      speicher.pruefe(
        'google',
        jwt(frisch(), paar.privateKey, { alg: 'RS256', kid: 'k9' }),
        jetztErwartung,
      ),
    ).rejects.toThrow('Signatur');
  });

  it('lehnt ein verändertes Token ab', async () => {
    const [kopf, , signatur] = jwt(frisch()).split('.');
    const anders = Buffer.from(
      JSON.stringify({ ...frisch(), sub: 'jemand-anderes' }),
    ).toString('base64url');

    await expect(
      speicher.pruefe(
        'google',
        `${kopf}.${anders}.${signatur}`,
        jetztErwartung,
      ),
    ).rejects.toThrow('Signatur');
  });
});
