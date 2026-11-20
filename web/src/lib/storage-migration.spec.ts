import { beforeEach, describe, expect, it, vi } from 'vitest';

import { holeAltenSpeicher } from './storage-migration';

const speicherAttrappe = (): Storage => {
  const inhalt = new Map<string, string>();

  return {
    get length() {
      return inhalt.size;
    },
    key: (i: number) => [...inhalt.keys()][i] ?? null,
    getItem: (k: string) => inhalt.get(k) ?? null,
    setItem: (k: string, v: string) => {
      inhalt.set(k, v);
    },
    removeItem: (k: string) => {
      inhalt.delete(k);
    },
    clear: () => {
      inhalt.clear();
    },
  } as Storage;
};

const setzeSpeicher = (speicher: Storage): void => {
  vi.stubGlobal('window', { localStorage: speicher });
};

describe('holeAltenSpeicher', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('hängt einen Schlüssel von canla auf stegwerk um', () => {
    const s = speicherAttrappe();
    s.setItem('canla.session', '{"token":"abc"}');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('stegwerk.session')).toBe('{"token":"abc"}');
  });

  it('holt auch, was noch unter weitblick liegt', () => {
    const s = speicherAttrappe();
    s.setItem('weitblick.theme', 'dark');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('stegwerk.theme')).toBe('dark');
  });

  it('nimmt alle Schlüssel mit, nicht nur den ersten', () => {
    const s = speicherAttrappe();
    s.setItem('canla.session', 'a');
    s.setItem('canla.theme', 'dark');
    s.setItem('canla.columns.companies', '["name"]');
    s.setItem('canla.deals.view', 'board');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('stegwerk.session')).toBe('a');
    expect(s.getItem('stegwerk.theme')).toBe('dark');
    expect(s.getItem('stegwerk.columns.companies')).toBe('["name"]');
    expect(s.getItem('stegwerk.deals.view')).toBe('board');
  });

  it('überschreibt nicht, was unter dem neuen Namen schon steht', () => {
    const s = speicherAttrappe();
    s.setItem('canla.theme', 'dark');
    s.setItem('stegwerk.theme', 'light');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('stegwerk.theme')).toBe('light');
  });

  it('lässt den alten Eintrag liegen', () => {
    const s = speicherAttrappe();
    s.setItem('canla.session', 'a');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('canla.session')).toBe('a');
  });

  it('lässt fremde Schlüssel in Ruhe', () => {
    const s = speicherAttrappe();
    s.setItem('etwas.anderes', 'x');
    setzeSpeicher(s);

    holeAltenSpeicher();

    expect(s.getItem('stegwerk.anderes')).toBeNull();
    expect(s.getItem('etwas.anderes')).toBe('x');
  });

  it('läuft nur einmal', () => {
    const s = speicherAttrappe();
    s.setItem('canla.session', 'alt');
    setzeSpeicher(s);

    holeAltenSpeicher();
    s.removeItem('stegwerk.session');
    holeAltenSpeicher();

    expect(s.getItem('stegwerk.session')).toBeNull();
  });

  it('stürzt nicht ab, wenn der Speicher gesperrt ist', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('gesperrt');
      },
    });

    expect(() => {
      holeAltenSpeicher();
    }).not.toThrow();
  });

  it('stürzt nicht ab, wenn das Schreiben scheitert', () => {
    const s = speicherAttrappe();
    s.setItem('canla.session', 'a');
    const kaputt = {
      ...s,
      length: s.length,
      key: (i: number) => s.key(i),
      getItem: (k: string) => s.getItem(k),
      setItem: () => {
        throw new Error('voll');
      },
    } as unknown as Storage;
    setzeSpeicher(kaputt);

    expect(() => {
      holeAltenSpeicher();
    }).not.toThrow();
  });
});
