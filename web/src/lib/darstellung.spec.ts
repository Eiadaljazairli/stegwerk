import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  feldZumSpeichern,
  geltendesFeld,
  leseDarstellung,
  LISTE,
  merkeDarstellung,
  wahlZumSpeichern,
} from './darstellung';

const speicher = () => {
  const werte = new Map<string, string>();

  return {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => void werte.set(key, wert),
  };
};

describe('gemerkte Darstellung', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: speicher() }));
  afterEach(() => vi.unstubAllGlobals());

  it('ist ohne Wahl die Liste', () => {
    expect(leseDarstellung('firmen')).toEqual(LISTE);
  });

  it('merkt sich Board, Kalender und Felder je Liste', () => {
    merkeDarstellung('firmen', {
      art: 'kalender',
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });

    expect(leseDarstellung('firmen')).toEqual({
      art: 'kalender',
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });
    expect(leseDarstellung('kontakte')).toEqual(LISTE);
  });

  it('übernimmt das Board von vor diesem Speicher', () => {
    window.localStorage.setItem('stegwerk.deals.view', 'board');

    expect(
      leseDarstellung('deals', { schluessel: 'stegwerk.deals.view' }).art,
    ).toBe('board');
  });

  it('nimmt Unlesbares und fremde Feldnamen nicht', () => {
    window.localStorage.setItem(
      'stegwerk.firmen.darstellung',
      JSON.stringify({ art: 'zeitstrahl', gruppenFeld: 'name; DROP' }),
    );

    expect(leseDarstellung('firmen')).toEqual(LISTE);

    window.localStorage.setItem('stegwerk.firmen.darstellung', '{kaputt');

    expect(leseDarstellung('firmen')).toEqual(LISTE);
  });

  it('wirft ohne Speicher nicht', () => {
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

    expect(leseDarstellung('firmen')).toEqual(LISTE);
    expect(() => merkeDarstellung('firmen', LISTE)).not.toThrow();
  });
});

describe('geltendesFeld', () => {
  const felder = [{ key: 'std:stage' }, { key: 'custom:region' }];

  it('nimmt das gewählte, wenn es das gibt', () => {
    expect(geltendesFeld('custom:region', 'std:stage', felder)).toBe(
      'custom:region',
    );
  });

  it('fällt auf das der Liste zurück, wenn das gewählte fehlt oder verborgen ist', () => {
    expect(geltendesFeld('custom:weg', 'std:stage', felder)).toBe('std:stage');
    expect(geltendesFeld(null, 'std:stage', felder)).toBe('std:stage');
  });

  it('nimmt sonst das erste und ohne Felder keines', () => {
    expect(geltendesFeld(null, null, felder)).toBe('std:stage');
    expect(geltendesFeld(null, 'std:closeDate', [])).toBeNull();
  });
});

describe('feldZumSpeichern', () => {
  it('speichert das Feld der Liste als keine Angabe', () => {
    expect(feldZumSpeichern('std:stage', 'std:stage')).toBeNull();
    expect(feldZumSpeichern('custom:region', 'std:stage')).toBe(
      'custom:region',
    );
  });
});

describe('wahlZumSpeichern', () => {
  const felder = {
    boardFelder: [{ key: 'std:stage' }, { key: 'custom:region' }],
    datumFelder: [{ key: 'std:closeDate' }],
    geladen: true,
  };

  it('behält Felder, die es gibt', () => {
    const wahl = {
      art: 'board' as const,
      gruppenFeld: 'custom:region',
      datumFeld: 'std:closeDate',
    };

    expect(wahlZumSpeichern(wahl, felder)).toEqual(wahl);
  });

  it('schickt statt eines archivierten Felds das der Liste', () => {
    expect(
      wahlZumSpeichern(
        {
          art: 'kalender',
          gruppenFeld: 'custom:alt',
          datumFeld: 'custom:vertragsende',
        },
        felder,
      ),
    ).toEqual({ art: 'kalender', gruppenFeld: null, datumFeld: null });
  });

  it('lässt die Wahl, solange die Felder laden', () => {
    const wahl = {
      art: 'board' as const,
      gruppenFeld: 'custom:region',
      datumFeld: null,
    };

    expect(
      wahlZumSpeichern(wahl, {
        boardFelder: [],
        datumFelder: [],
        geladen: false,
      }),
    ).toEqual(wahl);
  });
});
