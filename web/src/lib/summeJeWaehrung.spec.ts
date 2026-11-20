import { describe, expect, it } from 'vitest';

import { summeJeWaehrung } from './summeJeWaehrung';

describe('summeJeWaehrung', () => {
  it('zählt je Währung, Euro zuerst', () => {
    expect(
      summeJeWaehrung([
        { amount: 100, currency: 'USD' },
        { amount: 200, currency: 'EUR' },
        { amount: 50, currency: 'USD' },
        { amount: 10, currency: null },
      ]),
    ).toEqual([
      { waehrung: 'EUR', summe: 210 },
      { waehrung: 'USD', summe: 150 },
    ]);
  });

  it('lässt Geschäfte ohne Betrag aus', () => {
    expect(
      summeJeWaehrung([
        { amount: null, currency: 'EUR' },
        { amount: null, currency: 'EUR' },
      ]),
    ).toEqual([]);
  });
});
