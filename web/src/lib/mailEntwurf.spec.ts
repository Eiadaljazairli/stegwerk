import { describe, expect, it } from 'vitest';

import { adressListe } from './mailEntwurf';

describe('Empfänger eines Entwurfs', () => {
  it('zerlegt an Komma, Semikolon und Zeilenumbruch, ohne Leeres und Doppeltes', () => {
    expect(
      adressListe(' a@kunde.de, b@kunde.de;\nA@Kunde.de ,, c@kunde.de '),
    ).toEqual(['a@kunde.de', 'b@kunde.de', 'c@kunde.de']);
  });

  it('gibt für ein leeres Feld eine leere Liste', () => {
    expect(adressListe('   ')).toEqual([]);
  });
});
