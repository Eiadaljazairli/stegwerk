import {
  belegFehler,
  lineNetCents,
  type QuoteLine,
  quoteTotals,
} from './quote-totals';

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  quantity: 1,
  unitPriceCents: 10_000,
  discountPercent: 0,
  taxRatePercent: 19,
  ...over,
});

describe('a single line', () => {
  it('multiplies quantity by price', () => {
    expect(lineNetCents(line({ quantity: 3, unitPriceCents: 2500 }))).toBe(
      7500,
    );
  });

  it('handles a fractional quantity', () => {
    expect(lineNetCents(line({ quantity: 2.5, unitPriceCents: 9000 }))).toBe(
      22_500,
    );
  });

  it('takes the discount off', () => {
    expect(
      lineNetCents(line({ unitPriceCents: 10_000, discountPercent: 10 })),
    ).toBe(9000);
  });

  it('rounds up when the fraction is half or more', () => {
    expect(
      lineNetCents(line({ unitPriceCents: 3333, discountPercent: 25 })),
    ).toBe(2500);
  });

  it('rounds down when it is less than half', () => {
    expect(
      lineNetCents(line({ unitPriceCents: 3333, discountPercent: 15 })),
    ).toBe(2833);
  });

  it('rounds a fractional quantity to the cent', () => {
    expect(lineNetCents(line({ quantity: 0.333 }))).toBe(3330);
  });

  it('is exact where a float would not be', () => {
    expect(lineNetCents(line({ quantity: 3, unitPriceCents: 10 }))).toBe(30);
  });

  it('handles a free line', () => {
    expect(lineNetCents(line({ unitPriceCents: 0 }))).toBe(0);
  });

  it('handles a full discount', () => {
    expect(lineNetCents(line({ discountPercent: 100 }))).toBe(0);
  });
});

describe('the totals', () => {
  it('is all zeros for a quote with no lines', () => {
    expect(quoteTotals([])).toEqual({
      netCents: 0,
      taxCents: 0,
      grossCents: 0,
      taxGroups: [],
    });
  });

  it('adds net, tax and gross for one rate', () => {
    const totals = quoteTotals([
      line({ unitPriceCents: 10_000 }),
      line({ unitPriceCents: 5000 }),
    ]);

    expect(totals.netCents).toBe(15_000);
    expect(totals.taxCents).toBe(2850);
    expect(totals.grossCents).toBe(17_850);
  });

  it('keeps each rate as its own group', () => {
    const totals = quoteTotals([
      line({ unitPriceCents: 10_000, taxRatePercent: 19 }),
      line({ unitPriceCents: 10_000, taxRatePercent: 7 }),
    ]);

    expect(totals.taxGroups).toEqual([
      { ratePercent: 7, netCents: 10_000, taxCents: 700 },
      { ratePercent: 19, netCents: 10_000, taxCents: 1900 },
    ]);
    expect(totals.taxCents).toBe(2600);
  });

  it('lists the lower rate first', () => {
    const totals = quoteTotals([
      line({ taxRatePercent: 19 }),
      line({ taxRatePercent: 7 }),
      line({ taxRatePercent: 0 }),
    ]);

    expect(totals.taxGroups.map((group) => group.ratePercent)).toEqual([
      0, 7, 19,
    ]);
  });

  it('works out tax once per rate, not once per line', () => {
    const totals = quoteTotals([
      line({ unitPriceCents: 333 }),
      line({ unitPriceCents: 333 }),
      line({ unitPriceCents: 333 }),
    ]);

    expect(totals.netCents).toBe(999);
    expect(totals.taxCents).toBe(190);
    expect(totals.grossCents).toBe(1189);
  });

  it('makes gross the sum of net and tax, always', () => {
    const totals = quoteTotals([
      line({ quantity: 7, unitPriceCents: 1234, discountPercent: 3 }),
      line({ quantity: 2.5, unitPriceCents: 9999, taxRatePercent: 7 }),
    ]);

    expect(totals.grossCents).toBe(totals.netCents + totals.taxCents);
  });

  it('makes net the sum of the lines the customer can read', () => {
    const lines = [
      line({ unitPriceCents: 3333, discountPercent: 15 }),
      line({ quantity: 0.333 }),
      line({ quantity: 2.5, unitPriceCents: 9000 }),
    ];

    expect(quoteTotals(lines).netCents).toBe(
      lines.reduce((sum, entry) => sum + lineNetCents(entry), 0),
    );
  });
});

describe('a small business under §19 UStG', () => {
  it('charges no tax at all', () => {
    const totals = quoteTotals(
      [line({ unitPriceCents: 10_000, taxRatePercent: 19 })],
      true,
    );

    expect(totals.taxCents).toBe(0);
    expect(totals.grossCents).toBe(totals.netCents);
  });

  it('collapses every rate into one group at zero', () => {
    const totals = quoteTotals(
      [line({ taxRatePercent: 19 }), line({ taxRatePercent: 7 })],
      true,
    );

    expect(totals.taxGroups).toEqual([
      { ratePercent: 0, netCents: 20_000, taxCents: 0 },
    ]);
  });

  it('still adds the lines up', () => {
    const totals = quoteTotals(
      [line({ unitPriceCents: 5000 }), line({ unitPriceCents: 2500 })],
      true,
    );

    expect(totals.netCents).toBe(7500);
  });
});

describe('a line that reverses another', () => {
  const line = {
    quantity: 0.5,
    unitPriceCents: 2469,
    discountPercent: 0,
    taxRatePercent: 19,
  };

  it('is the exact negative of the line it reverses', () => {
    expect(lineNetCents({ ...line, quantity: -line.quantity })).toBe(
      -lineNetCents(line),
    );
  });

  it('leaves nothing standing across a whole document', () => {
    const original = quoteTotals([line], false);
    const correction = quoteTotals(
      [{ ...line, quantity: -line.quantity }],
      false,
    );

    expect(original.netCents + correction.netCents).toBe(0);
    expect(original.taxCents + correction.taxCents).toBe(0);
    expect(original.grossCents + correction.grossCents).toBe(0);
  });

  it('rounds a half cent away from zero, as commercial rounding does', () => {
    expect(lineNetCents({ ...line, quantity: 1, unitPriceCents: 3 })).toBe(3);
    expect(
      lineNetCents({
        quantity: 1.5,
        unitPriceCents: 1,
        discountPercent: 0,
        taxRatePercent: 19,
      }),
    ).toBe(2);
    expect(
      lineNetCents({
        quantity: -1.5,
        unitPriceCents: 1,
        discountPercent: 0,
        taxRatePercent: 19,
      }),
    ).toBe(-2);
  });
});

describe('eine Korrektur, deren Steuer auf einen halben Cent fällt', () => {
  const zeilen = [
    {
      quantity: 3,
      unitPriceCents: 9500,
      discountPercent: 10,
      taxRatePercent: 19,
    },
    {
      quantity: 2,
      unitPriceCents: 4250,
      discountPercent: 0,
      taxRatePercent: 19,
    },
    {
      quantity: 1,
      unitPriceCents: 3990,
      discountPercent: 0,
      taxRatePercent: 7,
    },
  ];
  const umgekehrt = zeilen.map((zeile) => ({
    ...zeile,
    quantity: -zeile.quantity,
  }));

  it('rechnet die Rechnung, wie sie gedruckt wurde', () => {
    expect(quoteTotals(zeilen, false)).toMatchObject({
      netCents: 38140,
      taxCents: 6768,
      grossCents: 44908,
    });
  });

  it('hebt sich mit ihrer Korrektur auf den Cent auf, je Steuersatz', () => {
    const rechnung = quoteTotals(zeilen, false);
    const korrektur = quoteTotals(umgekehrt, false);

    expect(korrektur.grossCents).toBe(-rechnung.grossCents);
    expect(korrektur.taxGroups.map((gruppe) => gruppe.taxCents)).toEqual(
      rechnung.taxGroups.map((gruppe) => -gruppe.taxCents),
    );
  });
});

describe('Mengen mit Nachkommastellen', () => {
  const zeile = (
    quantity: number,
    unitPriceCents: number,
    discountPercent = 0,
  ) =>
    lineNetCents({
      quantity,
      unitPriceCents,
      discountPercent,
      taxRatePercent: 19,
    });

  it('rundet 1,005 × 1,00 € kaufmännisch auf 1,01 €', () => {
    expect(zeile(1.005, 100)).toBe(101);
    expect(zeile(-1.005, 100)).toBe(-101);
  });

  it('stimmt mit exakter Rechnung überein, über viele Mengen und Rabatte', () => {
    const exakt = (q: number, p: number, d: number): number => {
      const zaehler =
        BigInt(Math.round(q * 1000)) *
        BigInt(p) *
        BigInt(10000 - Math.round(d * 100));
      const nenner = 10_000_000n;

      return Number((zaehler * 2n + nenner) / (2n * nenner));
    };

    for (const q of [0.001, 0.015, 1.005, 1.115, 2.675, 3.335, 10.005, 0.333]) {
      for (const p of [1, 10, 99, 100, 250, 1000, 12345]) {
        for (const d of [0, 2.5, 7.5, 12.5, 33.33, 99.99]) {
          expect(zeile(q, p, d)).toBe(exakt(q, p, d));
        }
      }
    }
  });
});

describe('was nicht auf einen Beleg passt', () => {
  it('lässt gewöhnliche Positionen durch', () => {
    expect(belegFehler([line({ quantity: 2.125 }), line()])).toBeNull();
  });

  it('weist eine vierte Nachkommastelle ab, statt sie still zu runden', () => {
    expect(belegFehler([line({ quantity: 0.0004 })])).toMatch(
      /drei Nachkommastellen/,
    );
  });

  it('weist eine Summe ab, die sich nicht mehr laden ließe', () => {
    expect(
      belegFehler([line({ quantity: 100, unitPriceCents: 2_147_483_647 })]),
    ).toMatch(/höchstens/);
  });

  it('prüft auch die Steuer, die netto knapp unter der Grenze liegt', () => {
    expect(belegFehler([line({ unitPriceCents: 2_000_000_000 })])).toMatch(
      /höchstens/,
    );
  });
});
