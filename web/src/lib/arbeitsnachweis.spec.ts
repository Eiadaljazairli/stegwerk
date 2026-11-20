import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  type Aufgabe,
  alsKopf,
  loese,
  MINDESTZEIT_MS,
  nachweisVorrat,
  sha256,
  VORRAT_MS,
} from './arbeitsnachweis';

const hash = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

const aufgabe = (zahl: number, maxnumber = 500): Aufgabe => ({
  algorithm: 'SHA-256',
  challenge: hash(`salz?expires=1&issued=1${String(zahl)}`),
  maxnumber,
  salt: 'salz?expires=1&issued=1',
  signature: 'sig',
});

describe('loese', () => {
  it('findet die Zahl hinter der Aufgabe', async () => {
    expect(await loese(aufgabe(321))).toBe(321);
  });

  it('gibt null, wenn keine Zahl bis maxnumber passt', async () => {
    expect(await loese(aufgabe(600, 100))).toBeNull();
  });

  it('rechnet mit WebCrypto dasselbe wie der Server', async () => {
    expect(await sha256('stegwerk')).toBe(hash('stegwerk'));
  });
});

describe('alsKopf', () => {
  it('verpackt die Lösung als Base64-JSON im Format des Servers', () => {
    const roh = JSON.parse(atob(alsKopf(aufgabe(7), 7))) as Record<
      string,
      unknown
    >;

    expect(roh).toEqual({
      algorithm: 'SHA-256',
      challenge: aufgabe(7).challenge,
      number: 7,
      salt: 'salz?expires=1&issued=1',
      signature: 'sig',
    });
  });
});

describe('nachweisVorrat', () => {
  const aufbau = (start = 0) => {
    let jetzt = start;
    let geholt = 0;
    const gewartet: number[] = [];
    const vorrat = nachweisVorrat(
      () => {
        geholt += 1;

        return Promise.resolve({ kopf: `k${String(geholt)}`, erhalten: jetzt });
      },
      () => jetzt,
      (ms) => {
        gewartet.push(ms);
        jetzt += ms;

        return Promise.resolve();
      },
    );

    return {
      vorrat,
      gewartet,
      geholt: () => geholt,
      vor: (ms: number) => {
        jetzt += ms;
      },
    };
  };

  it('gibt jede Lösung nur einmal heraus und holt gleich die nächste', async () => {
    const t = aufbau();

    t.vorrat.vorbereiten();
    t.vor(10_000);

    expect(await t.vorrat.nimm()).toBe('k1');
    expect(t.geholt()).toBe(2);
    t.vor(10_000);
    expect(await t.vorrat.nimm()).toBe('k2');
  });

  it('wartet die Mindestzeit ab, statt zu früh abzuschicken', async () => {
    const t = aufbau();

    t.vorrat.vorbereiten();
    t.vor(1_000);

    expect(await t.vorrat.nimm()).toBe('k1');
    expect(t.gewartet).toEqual([MINDESTZEIT_MS - 1_000]);
  });

  it('holt eine neue Lösung, wenn die alte bald abläuft', async () => {
    const t = aufbau();

    t.vorrat.vorbereiten();
    t.vor(VORRAT_MS + 1);
    t.vorrat.vorbereiten();

    expect(t.geholt()).toBe(2);
    t.vor(5_000);
    expect(await t.vorrat.nimm()).toBe('k2');
  });

  it('meldet einen Fehler erst beim Absenden', async () => {
    const vorrat = nachweisVorrat(
      () => Promise.reject(new Error('Netz weg')),
      () => 0,
      () => Promise.resolve(),
    );

    vorrat.vorbereiten();

    await expect(vorrat.nimm()).rejects.toThrow('Netz weg');
  });
});
