import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beobachteEingaben,
  eingabenZaehlen,
  leerlaufStand,
  letzteEingabe,
} from './leerlauf';

describe('leerlaufStand', () => {
  const minute = 60_000;

  it('bleibt aktiv, wenn der Bereich nichts eingestellt hat', () => {
    expect(leerlaufStand(0, null, 10 * 60 * minute)).toEqual({ art: 'aktiv' });
  });

  it('warnt in der letzten Minute', () => {
    expect(leerlaufStand(0, 30, 29.5 * minute)).toEqual({
      art: 'warnung',
      sekunden: 30,
    });
  });

  it('ist vorher aktiv', () => {
    expect(leerlaufStand(0, 30, 28 * minute)).toEqual({ art: 'aktiv' });
  });

  it('läuft ab, wenn die Frist um ist', () => {
    expect(leerlaufStand(0, 30, 30 * minute)).toEqual({ art: 'abgelaufen' });
  });

  it('ohne bekannte Eingabe nicht abmelden', () => {
    expect(leerlaufStand(null, 30, 99 * minute)).toEqual({ art: 'aktiv' });
  });
});

describe('Öffnen der Seite', () => {
  const minute = 60_000;
  const zehnUhr = Date.UTC(2026, 9, 25, 10);
  const vierzehnUhr = zehnUhr + 240 * minute;

  const fenster = () => {
    const werte = new Map<string, string>();
    const hoerer = new Map<string, () => void>();

    return {
      localStorage: {
        getItem: (key: string) => werte.get(key) ?? null,
        setItem: (key: string, wert: string) => void werte.set(key, wert),
      },
      addEventListener: (art: string, hoeren: () => void) =>
        void hoerer.set(art, hoeren),
      removeEventListener: (art: string) => void hoerer.delete(art),
      ausloesen: (art: string) => hoerer.get(art)?.(),
      hoerer,
    };
  };

  let w: ReturnType<typeof fenster>;

  beforeEach(() => {
    w = fenster();
    w.localStorage.setItem('stegwerk.letzteEingabe', String(zehnUhr));
    vi.stubGlobal('window', w);
    vi.useFakeTimers();
    vi.setSystemTime(vierzehnUhr);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('zählt das Einhängen nicht als Eingabe', () => {
    const ende = beobachteEingaben(w as unknown as Window);

    expect(letzteEingabe()).toBe(zehnUhr);

    ende();
    expect(w.hoerer.size).toBe(0);
  });

  it('merkt sich echte Eingaben', () => {
    beobachteEingaben(w as unknown as Window);
    w.ausloesen('keydown');

    expect(letzteEingabe()).toBe(vierzehnUhr);
  });

  it('lässt nach abgelaufener Frist keine Eingabe mehr zählen', () => {
    expect(leerlaufStand(letzteEingabe(), 30, vierzehnUhr)).toEqual({
      art: 'abgelaufen',
    });
    expect(eingabenZaehlen(true, letzteEingabe(), 30, vierzehnUhr)).toBe(false);
  });

  it('zählt erst, wenn die Frist bekannt ist', () => {
    expect(eingabenZaehlen(false, vierzehnUhr, 30, vierzehnUhr)).toBe(false);
    expect(eingabenZaehlen(true, vierzehnUhr, 30, vierzehnUhr)).toBe(true);
    expect(eingabenZaehlen(true, zehnUhr, null, vierzehnUhr)).toBe(true);
  });
});
