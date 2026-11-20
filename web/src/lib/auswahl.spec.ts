import { describe, expect, it } from 'vitest';

import { auswahlOptionen, naechsteMarke, nameTeilen } from './auswahl';

const treffer = [
  { id: 'a', titel: 'Nordwind GmbH', zusatz: 'Kiel' },
  { id: 'b', titel: 'Nordlicht AG' },
];

describe('Datensatz-Auswahl', () => {
  it('bietet „neu anlegen“ nur, wenn etwas getippt ist und nichts genau so heißt', () => {
    expect(auswahlOptionen('', treffer, [], true).map((o) => o.art)).toEqual([
      'treffer',
      'treffer',
    ]);
    expect(auswahlOptionen('Nord', treffer, [], true).at(-1)).toEqual({
      art: 'neu',
      text: 'Nord',
    });
    expect(
      auswahlOptionen(' nordwind gmbh ', treffer, [], true).some(
        (o) => o.art === 'neu',
      ),
    ).toBe(false);
    expect(
      auswahlOptionen('Nord', treffer, [], false).some((o) => o.art === 'neu'),
    ).toBe(false);
  });

  it('lässt schon verknüpfte weg', () => {
    expect(auswahlOptionen('', treffer, ['a'], false)).toEqual([
      { art: 'treffer', treffer: treffer[1] },
    ]);
  });

  it('wandert mit den Pfeilen im Kreis', () => {
    expect(naechsteMarke(-1, 3, 1)).toBe(0);
    expect(naechsteMarke(-1, 3, -1)).toBe(2);
    expect(naechsteMarke(2, 3, 1)).toBe(0);
    expect(naechsteMarke(0, 3, -1)).toBe(2);
    expect(naechsteMarke(0, 0, 1)).toBe(-1);
  });

  it('teilt einen getippten Namen in Vor- und Nachname', () => {
    expect(nameTeilen('Eva Maria Schulz')).toEqual({
      firstName: 'Eva Maria',
      lastName: 'Schulz',
    });
    expect(nameTeilen('  Schulze ')).toBeNull();
    expect(nameTeilen('')).toBeNull();
  });
});
