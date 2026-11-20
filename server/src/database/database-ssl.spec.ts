import { databaseSsl, databaseUrl } from './database-ssl';

const PEM_ANFANG = '-----BEGIN CERTIFICATE-----';

const PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBkTCB+wIJAKm7Vg8Yr7hFMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl',
  'c3RjYTAeFw0yNjA5MDgwMDAwMDBaFw0zNjA5MDUwMDAwMDBaMBExDzANBgNVBAMM',
  '-----END CERTIFICATE-----',
].join('\n');

describe('ohne Zertifikat', () => {
  it('gibt nichts vor, wenn keines gesetzt ist', () => {
    expect(databaseSsl(undefined)).toBeUndefined();
  });

  it('behandelt eine leere Variable wie eine fehlende', () => {
    expect(databaseSsl('')).toBeUndefined();
    expect(databaseSsl('   \n  ')).toBeUndefined();
  });
});

describe('mit Zertifikat', () => {
  it('nimmt PEM, wie es aus der heruntergeladenen Datei kommt', () => {
    expect(databaseSsl(PEM)).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('nimmt dasselbe base64-kodiert', () => {
    const kodiert = Buffer.from(PEM, 'utf8').toString('base64');

    expect(databaseSsl(kodiert)).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('übersteht Leerraum am Rand', () => {
    expect(databaseSsl(`\n  ${PEM}\n\n`)).toEqual({
      ca: PEM,
      rejectUnauthorized: true,
    });
  });

  it('prüft immer — die Prüfung lässt sich nicht abwählen', () => {
    expect(databaseSsl(PEM)?.rejectUnauthorized).toBe(true);
  });

  it('weist zurück, was kein Zertifikat ist', () => {
    expect(() => databaseSsl('hallo')).toThrow(/kein Zertifikat/u);
  });

  it('weist auch base64 zurück, das nach etwas anderem aussieht', () => {
    const unsinn = Buffer.from('nur Text, kein PEM', 'utf8').toString('base64');

    expect(() => databaseSsl(unsinn)).toThrow(/kein Zertifikat/u);
  });
});

describe('databaseUrl', () => {
  const ZERT = `${PEM_ANFANG}\nMIIB\n-----END CERTIFICATE-----`;
  const ADRESSE = 'postgres://nutzer:geheim@db.example:5432/bestand';

  it('entfernt sslmode, wenn ein Zertifikat vorliegt', () => {
    expect(databaseUrl(`${ADRESSE}?sslmode=require`, ZERT)).toBe(ADRESSE);
  });

  it.each(['require', 'verify-ca', 'verify-full', 'no-verify', 'prefer'])(
    'entfernt sslmode=%s',
    (modus) => {
      expect(databaseUrl(`${ADRESSE}?sslmode=${modus}`, ZERT)).toBe(ADRESSE);
    },
  );

  it('lässt die Adresse in Ruhe, wenn kein Zertifikat vorliegt', () => {
    expect(databaseUrl(`${ADRESSE}?sslmode=require`, undefined)).toBe(
      `${ADRESSE}?sslmode=require`,
    );
    expect(databaseUrl(`${ADRESSE}?sslmode=require`, '   ')).toBe(
      `${ADRESSE}?sslmode=require`,
    );
  });

  it('behält andere Parameter', () => {
    expect(
      databaseUrl(`${ADRESSE}?sslmode=require&application_name=stegwerk`, ZERT),
    ).toBe(`${ADRESSE}?application_name=stegwerk`);
  });

  it('entfernt auch sslrootcert', () => {
    expect(
      databaseUrl(`${ADRESSE}?sslmode=verify-ca&sslrootcert=/tmp/ca.pem`, ZERT),
    ).toBe(ADRESSE);
  });

  it('lässt eine Adresse ohne Parameter unverändert', () => {
    expect(databaseUrl(ADRESSE, ZERT)).toBe(ADRESSE);
  });

  it('behält Benutzer, Passwort, Port und Datenbanknamen', () => {
    const raus = databaseUrl(`${ADRESSE}?sslmode=require`, ZERT) ?? '';

    expect(raus).toContain('nutzer:geheim@');
    expect(raus).toContain('db.example:5432');
    expect(raus).toContain('/bestand');
    expect(raus).not.toContain('null');
    expect(raus.startsWith('postgres://')).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['leer', ''],
  ])('gibt %s unverändert zurück', (_wie, adresse) => {
    expect(databaseUrl(adresse, ZERT)).toBe(adresse);
  });

  it('lässt eine nicht zerlegbare Adresse unangetastet', () => {
    const schluesselWert = 'host=db.example port=5432 dbname=bestand';

    expect(databaseUrl(schluesselWert, ZERT)).toBe(schluesselWert);
  });
});
