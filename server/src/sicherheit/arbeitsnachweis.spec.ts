import { createHash } from 'node:crypto';

import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import {
  type Aufgabe,
  ArbeitsnachweisService,
  erstelleAufgabe,
  GUELTIG_MS,
  nachweisSchluessel,
  pruefeLoesung,
  SCHWIERIGKEIT,
} from './arbeitsnachweis';
import { ArbeitsnachweisGuard, zuSchnell } from './arbeitsnachweis.guard';

const SUITE = 'arbeitsnachweis';
const SCHLUESSEL = nachweisSchluessel(
  '',
  'probe-geheimnis-mit-genug-zeichen-123',
);

jest.setTimeout(60_000);

const loese = (aufgabe: Aufgabe, zahl?: number): string => {
  let gefunden = zahl;

  for (let n = 0; gefunden === undefined && n <= aufgabe.maxnumber; n += 1) {
    const hash = createHash('sha256')
      .update(`${aufgabe.salt}${String(n)}`)
      .digest('hex');

    if (hash === aufgabe.challenge) {
      gefunden = n;
    }
  }

  return Buffer.from(
    JSON.stringify({
      algorithm: aufgabe.algorithm,
      challenge: aufgabe.challenge,
      number: gefunden,
      salt: aufgabe.salt,
      signature: aufgabe.signature,
    }),
  ).toString('base64');
};

describe('pruefeLoesung', () => {
  it('nimmt eine richtige Lösung an', () => {
    const jetzt = new Date();
    const aufgabe = erstelleAufgabe(SCHLUESSEL, jetzt, 200);

    expect(pruefeLoesung(SCHLUESSEL, loese(aufgabe), jetzt)).toMatchObject({
      ergebnis: 'ok',
      ausgestellt: jetzt,
    });
  });

  it('lehnt fehlende, kaputte und falsche Lösungen ab', () => {
    const aufgabe = erstelleAufgabe(SCHLUESSEL, new Date(), 200);
    const richtig = JSON.parse(
      Buffer.from(loese(aufgabe), 'base64').toString(),
    ) as { number: number };

    expect(pruefeLoesung(SCHLUESSEL, undefined).ergebnis).toBe('fehlt');
    expect(pruefeLoesung(SCHLUESSEL, '').ergebnis).toBe('fehlt');
    expect(pruefeLoesung(SCHLUESSEL, 'kein-base64-json').ergebnis).toBe(
      'ungueltig',
    );
    expect(
      pruefeLoesung(SCHLUESSEL, loese(aufgabe, richtig.number + 1)).ergebnis,
    ).toBe('ungueltig');
  });

  it('erkennt eine Aufgabe mit fremdem Schlüssel', () => {
    const fremd = nachweisSchluessel('anderer-schluessel', 'egal');
    const aufgabe = erstelleAufgabe(fremd, new Date(), 200);

    expect(pruefeLoesung(SCHLUESSEL, loese(aufgabe)).ergebnis).toBe(
      'ungueltig',
    );
  });

  it('lässt sich das Ablaufdatum nicht verschieben', () => {
    const aufgabe = erstelleAufgabe(SCHLUESSEL, new Date(), 200);
    const verschoben = {
      ...aufgabe,
      salt: aufgabe.salt.replace(/expires=\d+/u, 'expires=9999999999'),
    };

    expect(pruefeLoesung(SCHLUESSEL, loese(verschoben, 0)).ergebnis).toBe(
      'ungueltig',
    );
  });

  it('lässt sich keine Ziffer von „issued“ in die Zahl schieben', () => {
    const jetzt = new Date(Math.floor(Date.now() / 10) * 10 + 7);
    const aufgabe = erstelleAufgabe(SCHLUESSEL, jetzt, 200);
    const { number } = JSON.parse(
      Buffer.from(loese(aufgabe), 'base64').toString(),
    ) as { number: number };
    const ziffer = aufgabe.salt.slice(-1);
    const gekuerzt = { ...aufgabe, salt: aufgabe.salt.slice(0, -1) };
    const geschoben = Number(`${ziffer}${String(number)}`);

    expect(
      createHash('sha256')
        .update(`${gekuerzt.salt}${String(geschoben)}`)
        .digest('hex'),
    ).toBe(aufgabe.challenge);

    expect(
      pruefeLoesung(SCHLUESSEL, loese(gekuerzt, geschoben), jetzt).ergebnis,
    ).toBe('ungueltig');
  });

  it('lehnt eine Zahl über der höchsten ab', () => {
    const aufgabe = erstelleAufgabe(SCHLUESSEL, new Date(), 200);

    expect(
      pruefeLoesung(SCHLUESSEL, loese(aufgabe, SCHWIERIGKEIT + 1)).ergebnis,
    ).toBe('ungueltig');
  });

  it('lehnt eine abgelaufene Aufgabe ab', () => {
    const damals = new Date(Date.now() - GUELTIG_MS - 1000);
    const aufgabe = erstelleAufgabe(SCHLUESSEL, damals, 200);

    expect(pruefeLoesung(SCHLUESSEL, loese(aufgabe)).ergebnis).toBe(
      'abgelaufen',
    );
  });
});

describe('ArbeitsnachweisService und Wächter', () => {
  let dataSource: DataSource;
  let dienst: ArbeitsnachweisService;

  beforeAll(async () => {
    dataSource = await createTestDatabase(SUITE);
    dienst = new ArbeitsnachweisService(dataSource, {
      get: () => '',
      getOrThrow: () => 'probe-geheimnis-mit-genug-zeichen-123',
    } as unknown as ConfigService);
  });

  afterAll(async () => {
    await dropTestDatabase(dataSource, SUITE);
  });

  const kontext = (req: Record<string, unknown>) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  it('löst eine Lösung genau einmal ein', async () => {
    const loesung = loese(erstelleAufgabe(SCHLUESSEL, new Date(), 200));

    expect((await dienst.einloesen(loesung)).ergebnis).toBe('ok');
    expect((await dienst.einloesen(loesung)).ergebnis).toBe('verbraucht');
  });

  it('nimmt zwei gleichzeitige Einlösungen derselben Lösung nur einmal an', async () => {
    const loesung = loese(erstelleAufgabe(SCHLUESSEL, new Date(), 200));
    const ergebnisse = await Promise.all([
      dienst.einloesen(loesung),
      dienst.einloesen(loesung),
    ]);

    expect(ergebnisse.map((e) => e.ergebnis).sort()).toEqual([
      'ok',
      'verbraucht',
    ]);
  });

  it('der Wächter weist ohne Lösung mit 400 ab', async () => {
    const waechter = new ArbeitsnachweisGuard(dienst);

    await expect(
      waechter.canActivate(kontext({ headers: {} })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('der Wächter lässt eine frische Lösung durch und merkt die Zeit', async () => {
    const waechter = new ArbeitsnachweisGuard(dienst);
    const req: Record<string, unknown> = {
      headers: {
        'x-arbeitsnachweis': loese(
          erstelleAufgabe(SCHLUESSEL, new Date(), 200),
        ),
      },
    };

    await expect(waechter.canActivate(kontext(req))).resolves.toBe(true);
    expect(zuSchnell(req as never)).toBe(true);
    expect(zuSchnell(req as never, new Date(Date.now() + 5_000))).toBe(false);
  });
});
