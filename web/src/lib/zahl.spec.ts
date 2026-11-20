import { describe, expect, it } from 'vitest';

import { leseZahl } from './zahl';

describe('leseZahl', () => {
  it('liest deutsche Schreibweisen', () => {
    expect(leseZahl('2500,50')).toBe(2500.5);
    expect(leseZahl('1.500,00')).toBe(1500);
    expect(leseZahl('1.500')).toBe(1500);
    expect(leseZahl('1.250.000')).toBe(1250000);
    expect(leseZahl('1 500 €')).toBe(1500);
    expect(leseZahl('-3,5')).toBe(-3.5);
  });

  it('liest auch den Punkt als Dezimalzeichen, wo er keiner Tausendergruppe gleicht', () => {
    expect(leseZahl('1500.5')).toBe(1500.5);
    expect(leseZahl('12.34')).toBe(12.34);
    expect(leseZahl('0.5')).toBe(0.5);
    expect(leseZahl('0.500')).toBe(0.5);
  });

  it('unterscheidet leer von unlesbar', () => {
    expect(leseZahl('  ')).toBeNull();
    expect(leseZahl('abc')).toBeUndefined();
    expect(leseZahl('1,2,3')).toBeUndefined();
    expect(leseZahl('1.50,00')).toBeUndefined();
  });
});
