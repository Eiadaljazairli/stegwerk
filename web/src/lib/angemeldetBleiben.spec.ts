import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BROWSER_MARKE,
  hatMarke,
  liesWahl,
  markeCookie,
  merkeWahl,
  sitzungGilt,
} from './angemeldetBleiben';

describe('Browser-Marke', () => {
  it('erkennt die Marke zwischen anderen Cookies', () => {
    expect(hatMarke(`a=1; ${BROWSER_MARKE}=1; b=2`)).toBe(true);
    expect(hatMarke(`${BROWSER_MARKE}=1`)).toBe(true);
    expect(hatMarke('a=1; b=2')).toBe(false);
    expect(hatMarke('')).toBe(false);
    expect(hatMarke(`x${BROWSER_MARKE}=1`)).toBe(false);
  });

  it('setzt kein Ablaufdatum, damit sie mit dem Browser endet', () => {
    const cookie = markeCookie(true);

    expect(cookie).not.toMatch(/expires|max-age/i);
    expect(cookie).toContain('Secure');
    expect(markeCookie(false)).not.toContain('Secure');
  });
});

describe('sitzungGilt', () => {
  it('lässt dauerhafte und alte Sitzungen immer gelten', () => {
    expect(sitzungGilt(true, '')).toBe(true);
    expect(sitzungGilt(undefined, '')).toBe(true);
  });

  it('lässt eine kurze nur gelten, solange der Browser offen war', () => {
    expect(sitzungGilt(false, `${BROWSER_MARKE}=1`)).toBe(true);
    expect(sitzungGilt(false, '')).toBe(false);
  });
});

describe('gemerkte Wahl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schlägt ohne Angabe „aus“ vor und merkt sich die letzte Wahl', () => {
    const speicher = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => speicher.get(k) ?? null,
        setItem: (k: string, v: string) => speicher.set(k, v),
      },
    });

    expect(liesWahl()).toBe(false);
    merkeWahl(true);
    expect(liesWahl()).toBe(true);
    merkeWahl(false);
    expect(liesWahl()).toBe(false);
  });

  it('bleibt ohne Speicher bei „aus“', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('gesperrt');
        },
        setItem: () => {
          throw new Error('gesperrt');
        },
      },
    });

    expect(liesWahl()).toBe(false);
    expect(() => merkeWahl(true)).not.toThrow();
  });
});
