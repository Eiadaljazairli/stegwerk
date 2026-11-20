import { describe, expect, it } from 'vitest';

import {
  aenderungBeimAblegen,
  type BoardFeld,
  OHNE,
  optionenDesFelds,
  spaltenFuer,
  spaltenSchluessel,
  wertAusSchluessel,
  wertDesFelds,
} from './recordBoard';
import { type CustomField } from './types';

const status: BoardFeld = {
  key: 'custom:status',
  label: 'Status',
  art: 'auswahl',
  optionen: [
    { wert: 'Neu', label: 'Neu', farbe: 'blau' },
    { wert: 'Aktiv', label: 'Aktiv', farbe: 'gruen' },
  ],
  ohneWert: 'Ohne Status',
};

describe('spaltenFuer', () => {
  it('zeigt alle Möglichkeiten in ihrer Reihenfolge, auch leere, und „ohne“ zuletzt', () => {
    const spalten = spaltenFuer(status, ['Aktiv']);

    expect(spalten.map((spalte) => spalte.label)).toEqual([
      'Neu',
      'Aktiv',
      'Ohne Status',
    ]);
    expect(spalten.every((spalte) => spalte.nimmtAn)).toBe(true);
    expect(spalten[0].farbe).toBe('blau');
    expect(spalten[2].schluessel).toBe(OHNE);
  });

  it('gibt einer gelöschten Möglichkeit eine Spalte, die nichts mehr annimmt', () => {
    const spalten = spaltenFuer(status, ['Alt', 'Neu']);
    const alt = spalten.find((spalte) => spalte.wert === 'Alt');

    expect(alt?.nimmtAn).toBe(false);
    expect(spalten.map((spalte) => spalte.wert)).toEqual([
      'Neu',
      'Aktiv',
      'Alt',
      null,
    ]);
  });

  it('bildet bei freiem Text eine Spalte je Wert, alphabetisch', () => {
    const branche: BoardFeld = {
      key: 'std:industry',
      label: 'Branche',
      art: 'text',
      optionen: [{ wert: 'Handel', label: 'Handel' }],
      ohneWert: 'Ohne Branche',
    };

    expect(
      spaltenFuer(branche, ['Maschinenbau', 'Bau', 'Bau', null, '']).map(
        (spalte) => spalte.label,
      ),
    ).toEqual(['Bau', 'Handel', 'Maschinenbau', 'Ohne Branche']);
  });

  it('nennt eine Person, die nicht mehr im Team ist, und lässt keine Karte zu ihr', () => {
    const person: BoardFeld = {
      key: 'std:assigneeId',
      label: 'Zuständig',
      art: 'person',
      optionen: [{ wert: 'p1', label: 'Anna Muster' }],
      ohneWert: null,
    };
    const spalten = spaltenFuer(person, ['p1', 'p9']);

    expect(spalten).toEqual([
      expect.objectContaining({ wert: 'p1', nimmtAn: true }),
      expect.objectContaining({
        wert: 'p9',
        label: 'Nicht mehr im Team',
        nimmtAn: false,
      }),
    ]);
  });

  it('zeigt „ohne“ bei einem Pflichtfeld nur, wenn es Karten ohne Wert gibt, und nimmt dort nichts an', () => {
    const person: BoardFeld = {
      key: 'std:assigneeId',
      label: 'Zuständig',
      art: 'person',
      optionen: [{ wert: 'p1', label: 'Anna' }],
      ohneWert: null,
    };

    expect(spaltenFuer(person, ['p1'])).toHaveLength(1);
    expect(spaltenFuer(person, [null]).at(-1)).toEqual(
      expect.objectContaining({ wert: null, nimmtAn: false }),
    );
  });
});

describe('Schlüssel einer Spalte', () => {
  it('macht aus „ohne Wert“ den leeren Schlüssel und zurück', () => {
    expect(spaltenSchluessel(null)).toBe(OHNE);
    expect(spaltenSchluessel('')).toBe(OHNE);
    expect(wertAusSchluessel(OHNE)).toBeNull();
    expect(wertAusSchluessel('Neu')).toBe('Neu');
  });
});

describe('aenderungBeimAblegen', () => {
  it('setzt ein eigenes Feld über customFields, auch auf leer', () => {
    expect(aenderungBeimAblegen('custom:status', 'Neu')).toEqual({
      customFields: { status: 'Neu' },
    });
    expect(aenderungBeimAblegen('custom:status', null)).toEqual({
      customFields: { status: null },
    });
  });

  it('kennt Verantwortlich, Branche und Zuständig', () => {
    expect(aenderungBeimAblegen('std:ownerId', 'p1')).toEqual({
      ownerId: 'p1',
    });
    expect(aenderungBeimAblegen('std:industry', null)).toEqual({
      industry: null,
    });
    expect(aenderungBeimAblegen('std:assigneeId', 'p2')).toEqual({
      assigneeId: 'p2',
    });
  });

  it('nimmt einer Aufgabe nie die zuständige Person und überlässt Phase und Stand ihrem eigenen Weg', () => {
    expect(aenderungBeimAblegen('std:assigneeId', null)).toBeNull();
    expect(aenderungBeimAblegen('std:stage', 'WON')).toBeNull();
    expect(aenderungBeimAblegen('std:status', 'erledigt')).toBeNull();
    expect(aenderungBeimAblegen('std:name', 'x')).toBeNull();
  });
});

describe('optionenDesFelds', () => {
  it('nimmt die Farbe jeder Möglichkeit mit, grau ohne Angabe', () => {
    const feld = {
      options: ['A', 'B'],
      farben: [{ option: 'B', farbe: 'rot' }],
    } as unknown as CustomField;

    expect(optionenDesFelds(feld)).toEqual([
      { wert: 'A', label: 'A', farbe: 'grau' },
      { wert: 'B', label: 'B', farbe: 'rot' },
    ]);
  });
});

describe('wertDesFelds', () => {
  const firma = {
    industry: 'Bau',
    city: '',
    owner: { id: 'p1' },
    customFields: { status: 'Neu', anzahl: 3 },
  };

  it('liest eigene Felder, den Verantwortlichen und feste Felder', () => {
    expect(wertDesFelds(firma, 'custom:status')).toBe('Neu');
    expect(wertDesFelds(firma, 'std:ownerId')).toBe('p1');
    expect(wertDesFelds({ ownerId: 'p2' }, 'std:ownerId')).toBe('p2');
    expect(wertDesFelds(firma, 'std:industry')).toBe('Bau');
  });

  it('zählt Leeres, Fehlendes und Nicht-Text als ohne Wert', () => {
    expect(wertDesFelds(firma, 'std:city')).toBeNull();
    expect(wertDesFelds(firma, 'custom:anzahl')).toBeNull();
    expect(wertDesFelds(firma, 'custom:fehlt')).toBeNull();
    expect(wertDesFelds({ owner: null }, 'std:ownerId')).toBeNull();
  });
});
