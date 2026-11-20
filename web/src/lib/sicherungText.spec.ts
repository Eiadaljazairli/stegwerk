import { describe, expect, it } from 'vitest';

import {
  ausserHausText,
  groesseText,
  probeText,
  type Sicherung,
  sicherungKurz,
} from './sicherungText';

const sicherung = (teil: Partial<Sicherung> = {}): Sicherung => ({
  zustand: 'ok',
  letzteSicherung: '2026-10-20T03:20:00Z',
  groesseBytes: 2_500_000,
  anzahl: 14,
  ausserHaus: 'abholen',
  kopien: 30,
  letzterFehler: null,
  letzterFehlerAm: null,
  probeAm: '2026-10-18T04:30:00Z',
  probeOk: true,
  probeDauerSek: 12,
  probeMeldung: 'Zurückgespielt und verglichen.',
  warnungen: [],
  ...teil,
});

describe('sicherungText', () => {
  it('schreibt Größen für Menschen', () => {
    expect(groesseText(null)).toBe('—');
    expect(groesseText(900)).toBe('900 Byte');
    expect(groesseText(2_500_000)).toBe('2,4 MB');
    expect(groesseText(3 * 1024 ** 3)).toBe('3 GB');
  });

  it('sagt, ob und wie eine Kopie den Server verlässt', () => {
    expect(ausserHausText('abholen', 30)).toBe(
      'verschlüsselt zum Abholen bereit (30 vorhanden)',
    );
    expect(ausserHausText('hochladen', null)).toBe('verschlüsselt hochgeladen');
    expect(ausserHausText('aus', 0)).toBe('nicht eingerichtet');
    expect(ausserHausText(null, null)).toBe('—');
  });

  it('fasst den Zustand in einem Wort zusammen', () => {
    expect(sicherungKurz(sicherung())).toBe('ok');
    expect(sicherungKurz(sicherung({ zustand: 'aus' }))).toBe(
      'nicht eingerichtet',
    );
    expect(sicherungKurz(sicherung({ warnungen: ['a'] }))).toBe('1 Warnung');
    expect(sicherungKurz(sicherung({ warnungen: ['a', 'b'] }))).toBe(
      '2 Warnungen',
    );
  });

  it('beschreibt den Wiederherstellungstest', () => {
    expect(probeText(sicherung())).toBe('bestanden, Einspielen dauerte 12 s');
    expect(probeText(sicherung({ probeAm: null }))).toBe('noch nie');
    expect(
      probeText(sicherung({ probeOk: false, probeMeldung: 'Tabelle fehlt.' })),
    ).toBe('gescheitert: Tabelle fehlt.');
  });
});
