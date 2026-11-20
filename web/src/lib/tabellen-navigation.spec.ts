import { describe, expect, it } from 'vitest';

import {
  ausSchluessel,
  innerhalb,
  naechsteZelle,
  zellenSchluessel,
} from './tabellen-navigation';

const GROESSE = { zeilen: 25, spalten: 4 };

describe('Tastatur in der Tabelle', () => {
  it('wandert mit den Pfeilen und bleibt am Rand stehen', () => {
    const start = { zeile: 0, spalte: 0 };

    expect(naechsteZelle(start, 'ArrowDown', GROESSE)).toEqual({
      zeile: 1,
      spalte: 0,
    });
    expect(naechsteZelle(start, 'ArrowRight', GROESSE)).toEqual({
      zeile: 0,
      spalte: 1,
    });
    expect(naechsteZelle(start, 'ArrowUp', GROESSE)).toEqual(start);
    expect(naechsteZelle(start, 'ArrowLeft', GROESSE)).toEqual(start);
    expect(
      naechsteZelle({ zeile: 24, spalte: 3 }, 'ArrowDown', GROESSE),
    ).toEqual({ zeile: 24, spalte: 3 });
  });

  it('springt mit Pos1, Ende und Bild', () => {
    const mitte = { zeile: 12, spalte: 2 };

    expect(naechsteZelle(mitte, 'Home', GROESSE)).toEqual({
      zeile: 12,
      spalte: 0,
    });
    expect(naechsteZelle(mitte, 'End', GROESSE)).toEqual({
      zeile: 12,
      spalte: 3,
    });
    expect(naechsteZelle(mitte, 'Home', GROESSE, true)).toEqual({
      zeile: 0,
      spalte: 0,
    });
    expect(naechsteZelle(mitte, 'End', GROESSE, true)).toEqual({
      zeile: 24,
      spalte: 3,
    });
    expect(naechsteZelle(mitte, 'PageDown', GROESSE)).toEqual({
      zeile: 22,
      spalte: 2,
    });
    expect(naechsteZelle(mitte, 'PageUp', GROESSE)).toEqual({
      zeile: 2,
      spalte: 2,
    });
  });

  it('kennt andere Tasten nicht und nichts in einer leeren Liste', () => {
    expect(naechsteZelle({ zeile: 0, spalte: 0 }, 'a', GROESSE)).toBe(null);
    expect(
      naechsteZelle({ zeile: 0, spalte: 0 }, 'ArrowDown', {
        zeilen: 0,
        spalten: 4,
      }),
    ).toBe(null);
  });

  it('holt die Zelle zurück, wenn die Liste kürzer wird', () => {
    expect(innerhalb({ zeile: 30, spalte: 9 }, GROESSE)).toEqual({
      zeile: 24,
      spalte: 3,
    });
  });

  it('schreibt die Zelle als Schlüssel und liest sie zurück', () => {
    expect(ausSchluessel(zellenSchluessel({ zeile: 3, spalte: 1 }))).toEqual({
      zeile: 3,
      spalte: 1,
    });
    expect(ausSchluessel('x')).toBe(null);
  });
});
