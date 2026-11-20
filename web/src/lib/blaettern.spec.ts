import { beforeEach, describe, expect, it } from 'vitest';

import { merkeReihenfolge, nachbarnVon } from './blaettern';

const speicher = new Map<string, string>();

Object.assign(globalThis, {
  window: {
    sessionStorage: {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => speicher.set(k, v),
    },
  },
});

describe('blaettern', () => {
  beforeEach(() => {
    speicher.clear();
  });

  it('findet die Nachbarn in der gemerkten Reihenfolge', () => {
    merkeReihenfolge('firma', ['a', 'b', 'c']);

    expect(nachbarnVon('firma', 'b')).toEqual({
      vorher: 'a',
      nachher: 'c',
      position: 2,
      anzahl: 3,
    });
    expect(nachbarnVon('firma', 'a')?.vorher).toBeNull();
    expect(nachbarnVon('firma', 'c')?.nachher).toBeNull();
  });

  it('bietet nichts an, wenn die Akte nicht aus der Liste kam', () => {
    merkeReihenfolge('firma', ['a', 'b']);

    expect(nachbarnVon('firma', 'x')).toBeNull();
    expect(nachbarnVon('kontakt', 'a')).toBeNull();
  });

  it('übersteht Unsinn im Speicher', () => {
    window.sessionStorage.setItem('stegwerk:blaettern:firma', '{kaputt');

    expect(nachbarnVon('firma', 'a')).toBeNull();
  });
});
