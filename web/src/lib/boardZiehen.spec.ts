import { describe, expect, it } from 'vitest';

import {
  type BoardSpalte,
  type Getragen,
  aktivierungFuer,
  ansage,
  tasteImBoard,
} from './boardZiehen';

const spalten: BoardSpalte[] = [
  { stage: 'LEAD', label: 'Anfrage', nimmtAn: true, karten: ['a', 'b'] },
  { stage: 'QUALIFIED', label: 'Geprüft', nimmtAn: true, karten: [] },
  { stage: 'PROPOSAL', label: 'Angebot', nimmtAn: false, karten: ['c'] },
  { stage: 'WON', label: 'Gewonnen', nimmtAn: true, karten: ['d', 'e', 'f'] },
];

const getragen = (ziel: Getragen['ziel'], von: Getragen['von'] = 'LEAD') => ({
  dealId: 'a',
  von,
  ziel,
});

describe('tasteImBoard ohne getragene Karte', () => {
  it('nimmt mit Leertaste und Enter auf, Ziel ist zunächst die eigene Phase', () => {
    for (const taste of [' ', 'Enter']) {
      expect(tasteImBoard(taste, spalten, 'b', null)).toEqual({
        art: 'aufnehmen',
        getragen: { dealId: 'b', von: 'LEAD', ziel: 'LEAD' },
      });
    }
  });

  it('geht mit Hoch und Runter von Karte zu Karte, nicht über den Rand', () => {
    expect(tasteImBoard('ArrowDown', spalten, 'a', null)).toEqual({
      art: 'fokus',
      dealId: 'b',
    });
    expect(tasteImBoard('ArrowUp', spalten, 'a', null)).toEqual({
      art: 'nichts',
    });
    expect(tasteImBoard('ArrowDown', spalten, 'b', null)).toEqual({
      art: 'nichts',
    });
  });

  it('springt seitlich in die nächste Spalte mit Karten, auf gleicher Höhe', () => {
    expect(tasteImBoard('ArrowRight', spalten, 'b', null)).toEqual({
      art: 'fokus',
      dealId: 'c',
    });
    expect(tasteImBoard('ArrowRight', spalten, 'c', null)).toEqual({
      art: 'fokus',
      dealId: 'd',
    });
    expect(tasteImBoard('ArrowLeft', spalten, 'f', null)).toEqual({
      art: 'fokus',
      dealId: 'c',
    });
    expect(tasteImBoard('ArrowLeft', spalten, 'a', null)).toEqual({
      art: 'nichts',
    });
  });

  it('kennt eine fremde Karte nicht', () => {
    expect(tasteImBoard(' ', spalten, 'x', null)).toEqual({ art: 'nichts' });
  });
});

describe('tasteImBoard mit getragener Karte', () => {
  it('wählt mit Pfeilen das Ziel und überspringt ausgeblendete Phasen', () => {
    expect(tasteImBoard('ArrowRight', spalten, 'a', getragen('LEAD'))).toEqual({
      art: 'ziel',
      getragen: getragen('QUALIFIED'),
    });
    expect(
      tasteImBoard('ArrowRight', spalten, 'a', getragen('QUALIFIED')),
    ).toEqual({ art: 'ziel', getragen: getragen('WON') });
    expect(tasteImBoard('ArrowRight', spalten, 'a', getragen('WON'))).toEqual({
      art: 'nichts',
    });
    expect(tasteImBoard('ArrowLeft', spalten, 'a', getragen('LEAD'))).toEqual({
      art: 'nichts',
    });
  });

  it('lässt eine Karte aus einer ausgeblendeten Phase dorthin zurück', () => {
    const c = { dealId: 'c', von: 'PROPOSAL' as const, ziel: 'WON' as const };

    expect(tasteImBoard('ArrowLeft', spalten, 'c', c)).toEqual({
      art: 'ziel',
      getragen: { ...c, ziel: 'PROPOSAL' },
    });
  });

  it('springt mit Pos1 und Ende an den Rand', () => {
    expect(tasteImBoard('End', spalten, 'a', getragen('LEAD'))).toEqual({
      art: 'ziel',
      getragen: getragen('WON'),
    });
    expect(tasteImBoard('Home', spalten, 'a', getragen('WON'))).toEqual({
      art: 'ziel',
      getragen: getragen('LEAD'),
    });
  });

  it('legt mit Leertaste oder Enter ab und bricht mit Escape oder Tab ab', () => {
    expect(tasteImBoard(' ', spalten, 'a', getragen('WON')).art).toBe(
      'ablegen',
    );
    expect(tasteImBoard('Enter', spalten, 'a', getragen('WON')).art).toBe(
      'ablegen',
    );
    expect(tasteImBoard('Escape', spalten, 'a', getragen('WON')).art).toBe(
      'abbrechen',
    );
    expect(tasteImBoard('Tab', spalten, 'a', getragen('WON')).art).toBe(
      'abbrechen',
    );
  });

  it('ordnet in der Spalte nichts um: Hoch und Runter tun nichts', () => {
    expect(tasteImBoard('ArrowUp', spalten, 'a', getragen('WON'))).toEqual({
      art: 'nichts',
    });
  });
});

describe('ansage', () => {
  it('sagt jeden Schritt auf Deutsch an', () => {
    expect(
      ansage({ art: 'aufnehmen', getragen: getragen('LEAD') }, spalten, 'X'),
    ).toContain('„X“ aufgenommen, Phase Anfrage');
    expect(
      ansage({ art: 'ziel', getragen: getragen('WON') }, spalten, 'X'),
    ).toBe('Gewonnen, Phase 3 von 3.');
    expect(
      ansage({ art: 'ablegen', getragen: getragen('WON') }, spalten, 'X'),
    ).toBe('„X“ nach Gewonnen verschoben.');
    expect(
      ansage({ art: 'ablegen', getragen: getragen('LEAD') }, spalten, 'X'),
    ).toBe('„X“ bleibt in Anfrage.');
    expect(
      ansage({ art: 'abbrechen', getragen: getragen('WON') }, spalten, 'X'),
    ).toBe('Verschieben abgebrochen. „X“ bleibt in Anfrage.');
    expect(ansage({ art: 'fokus', dealId: 'b' }, spalten, 'X')).toBeNull();
  });
});

describe('aktivierungFuer', () => {
  it('verlangt mit dem Finger langes Halten, mit der Maus nur Bewegung', () => {
    expect(aktivierungFuer('touch')).toEqual({
      art: 'halten',
      ms: 250,
      toleranz: 5,
    });
    expect(aktivierungFuer('mouse')).toEqual({ art: 'abstand', px: 8 });
    expect(aktivierungFuer('pen')).toEqual({ art: 'abstand', px: 8 });
  });
});
