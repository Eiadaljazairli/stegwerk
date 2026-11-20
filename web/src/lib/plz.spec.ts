import { describe, expect, it } from 'vitest';

import { meintDeutschland, ortErgaenzen, plzVollstaendig } from './plz';

const KOELN = { ort: 'Köln', bundesland: 'Nordrhein-Westfalen' };

describe('plzVollstaendig', () => {
  it.each([
    ['50667', true],
    [' 50667 ', true],
    ['5066', false],
    ['506671', false],
    ['A-1010', false],
    [null, false],
  ])('%s → %s', (plz, ok) => {
    expect(plzVollstaendig(plz)).toBe(ok);
  });
});

describe('meintDeutschland', () => {
  it('nimmt leer und die üblichen Schreibweisen als Deutschland', () => {
    expect(meintDeutschland(undefined)).toBe(true);
    expect(meintDeutschland(' Deutschland ')).toBe(true);
    expect(meintDeutschland('DE')).toBe(true);
    expect(meintDeutschland('Österreich')).toBe(false);
  });
});

describe('ortErgaenzen', () => {
  it('füllt einen leeren Ort und ein leeres Bundesland', () => {
    expect(ortErgaenzen({ ort: '', bundesland: '' }, [KOELN])).toEqual({
      ort: 'Köln',
      bundesland: 'Nordrhein-Westfalen',
    });
  });

  it('überschreibt nie einen Ort, der schon dasteht', () => {
    expect(ortErgaenzen({ ort: 'Köln-Deutz', bundesland: '' }, [KOELN])).toBe(
      null,
    );
  });

  it('lässt ein vorhandenes Bundesland stehen', () => {
    expect(ortErgaenzen({ ort: '', bundesland: 'NRW' }, [KOELN])).toEqual({
      ort: 'Köln',
    });
  });

  it('setzt kein Bundesland, wo es keines gibt (Firma)', () => {
    expect(ortErgaenzen({ ort: null }, [KOELN])).toEqual({ ort: 'Köln' });
  });

  it('entscheidet bei mehreren Orten nicht selbst', () => {
    expect(
      ortErgaenzen({ ort: '' }, [
        { ort: 'Husum', bundesland: 'Schleswig-Holstein' },
        { ort: 'Schwesing', bundesland: 'Schleswig-Holstein' },
      ]),
    ).toBe(null);
    expect(ortErgaenzen({ ort: '' }, [])).toBe(null);
  });
});
