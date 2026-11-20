import { describe, expect, it } from 'vitest';

import {
  aggregatName,
  aggregatOptionen,
  aggregatText,
  berechneAggregat,
  gueltigesAggregat,
  STANDARD_AGGREGAT,
  type ZahlFeld,
} from './boardAggregat';

const FELDER: ZahlFeld[] = [
  { feld: 'amount', label: 'Betrag' },
  { feld: 'custom:budget', label: 'Budget', waehrung: 'EUR' },
  { feld: 'custom:stunden', label: 'Stunden', waehrung: null },
];

const geschaeft = (
  amount: number | null,
  currency = 'EUR',
  customFields: Record<string, unknown> = {},
  wahrscheinlichkeit = 50,
) => ({ amount, currency, customFields, wahrscheinlichkeit });

const SPALTE = [
  geschaeft(1000),
  geschaeft(3000, 'EUR', { budget: 500, stunden: '12' }, 25),
  geschaeft(200, 'USD'),
  geschaeft(null, 'EUR', { budget: 1500 }),
];

const rechne = (
  art: Parameters<typeof berechneAggregat>[1]['art'],
  feld = 'amount',
) =>
  berechneAggregat(
    SPALTE,
    { art, feld },
    {
      feld: FELDER.find((eintrag) => eintrag.feld === feld),
      wahrscheinlichkeit: (eintrag) => eintrag.wahrscheinlichkeit,
    },
  );

describe('Kennzahl im Spaltenkopf', () => {
  it('summiert die Beträge je Währung, Euro zuerst', () => {
    expect(rechne('summe')).toEqual({
      art: 'werte',
      zeilen: [
        { waehrung: 'EUR', wert: 4000 },
        { waehrung: 'USD', wert: 200 },
      ],
    });
  });

  it('gewichtet mit der Wahrscheinlichkeit jedes Geschäfts', () => {
    expect(rechne('gewichtet')).toEqual({
      art: 'werte',
      zeilen: [
        { waehrung: 'EUR', wert: 1250 },
        { waehrung: 'USD', wert: 100 },
      ],
    });
  });

  it('nimmt für Durchschnitt, Min und Max nur Geschäfte mit Betrag', () => {
    expect(rechne('durchschnitt')).toEqual({
      art: 'werte',
      zeilen: [
        { waehrung: 'EUR', wert: 2000 },
        { waehrung: 'USD', wert: 200 },
      ],
    });
    expect(rechne('min').art === 'werte' && rechne('min')).toMatchObject({
      zeilen: [{ waehrung: 'EUR', wert: 1000 }, { wert: 200 }],
    });
    expect(rechne('max')).toMatchObject({
      zeilen: [{ waehrung: 'EUR', wert: 3000 }, { wert: 200 }],
    });
  });

  it('zählt, wie viele noch keinen Wert haben', () => {
    expect(rechne('leer')).toEqual({ art: 'anzahl', anzahl: 1 });
    expect(rechne('leer', 'custom:budget')).toEqual({
      art: 'anzahl',
      anzahl: 2,
    });
  });

  it('rechnet über eigene Felder in deren Währung, Zahlen auch aus Text', () => {
    expect(rechne('summe', 'custom:budget')).toEqual({
      art: 'werte',
      zeilen: [{ waehrung: 'EUR', wert: 2000 }],
    });
    expect(rechne('summe', 'custom:stunden')).toEqual({
      art: 'werte',
      zeilen: [{ waehrung: null, wert: 12 }],
    });
  });

  it('zeigt über einer leeren Spalte null Euro wie bisher, sonst einen Strich', () => {
    const leer = (art: 'summe' | 'durchschnitt') =>
      berechneAggregat(
        [],
        { art, feld: 'amount' },
        {
          feld: FELDER[0],
          wahrscheinlichkeit: () => 0,
        },
      );

    expect(leer('summe')).toEqual({
      art: 'werte',
      zeilen: [{ waehrung: 'EUR', wert: 0 }],
    });
    expect(aggregatText(leer('durchschnitt'), () => 'x')).toBe('—');
  });

  it('rundet auf Cent', () => {
    expect(
      berechneAggregat(
        [geschaeft(100), geschaeft(100), geschaeft(101)],
        { art: 'durchschnitt', feld: 'amount' },
        { feld: FELDER[0], wahrscheinlichkeit: () => 0 },
      ),
    ).toEqual({ art: 'werte', zeilen: [{ waehrung: 'EUR', wert: 100.33 }] });
  });
});

describe('Auswahl der Kennzahl', () => {
  it('bietet die Gewichtung nur beim Betrag und nur, wenn die Rolle die Wahrscheinlichkeit sieht', () => {
    const mit = aggregatOptionen(FELDER, true);
    const ohne = aggregatOptionen(FELDER, false);

    expect(mit.filter((option) => option.art === 'gewichtet')).toEqual([
      { art: 'gewichtet', feld: 'amount' },
    ]);
    expect(ohne.some((option) => option.art === 'gewichtet')).toBe(false);
  });

  it('bietet keine verborgenen Felder an: was nicht übergeben wird, fehlt', () => {
    const optionen = aggregatOptionen([FELDER[1]], true);

    expect(optionen.every((option) => option.feld === 'custom:budget')).toBe(
      true,
    );
    expect(gueltigesAggregat(STANDARD_AGGREGAT, optionen)).toEqual({
      art: 'summe',
      feld: 'custom:budget',
    });
    expect(gueltigesAggregat(undefined, [])).toBeNull();
  });

  it('fällt bei einer Wahl, die es nicht mehr gibt, auf die Summe zurück', () => {
    const optionen = aggregatOptionen(FELDER.slice(0, 2), true);

    expect(
      gueltigesAggregat({ art: 'max', feld: 'custom:geloescht' }, optionen),
    ).toEqual(STANDARD_AGGREGAT);
    expect(
      gueltigesAggregat({ art: 'max', feld: 'custom:budget' }, optionen),
    ).toEqual({ art: 'max', feld: 'custom:budget' });
  });

  it('benennt die Kennzahl verständlich', () => {
    expect(aggregatName({ art: 'durchschnitt', feld: 'amount' }, FELDER)).toBe(
      'Durchschnitt Betrag',
    );
    expect(aggregatName({ art: 'leer', feld: 'custom:budget' }, FELDER)).toBe(
      'Ohne Budget',
    );
    expect(aggregatText({ art: 'anzahl', anzahl: 1 }, () => '')).toBe(
      '1 Geschäft',
    );
    expect(
      aggregatText(
        {
          art: 'werte',
          zeilen: [
            { waehrung: 'EUR', wert: 1 },
            { waehrung: 'USD', wert: 2 },
          ],
        },
        (wert, waehrung) => `${String(wert)} ${waehrung ?? ''}`,
      ),
    ).toBe('1 EUR · 2 USD');
  });
});
