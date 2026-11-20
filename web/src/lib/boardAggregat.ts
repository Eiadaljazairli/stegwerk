export type AggregatArt =
  | 'summe'
  | 'gewichtet'
  | 'durchschnitt'
  | 'min'
  | 'max'
  | 'leer';

export type BoardAggregat = { art: AggregatArt; feld: string };

export const STANDARD_AGGREGAT: BoardAggregat = {
  art: 'summe',
  feld: 'amount',
};

const ARTEN: AggregatArt[] = [
  'summe',
  'gewichtet',
  'durchschnitt',
  'min',
  'max',
  'leer',
];

export const istAggregat = (x: unknown): x is BoardAggregat =>
  typeof x === 'object' &&
  x !== null &&
  ARTEN.includes((x as BoardAggregat).art) &&
  typeof (x as BoardAggregat).feld === 'string';

export type ZahlFeld = {
  feld: string;
  label: string;
  waehrung?: string | null;
};

export const aggregatOptionen = (
  felder: ZahlFeld[],
  mitGewichtung: boolean,
): BoardAggregat[] =>
  felder.flatMap((feld) =>
    ARTEN.filter(
      (art) => art !== 'gewichtet' || (feld.feld === 'amount' && mitGewichtung),
    ).map((art) => ({ art, feld: feld.feld })),
  );

export const gueltigesAggregat = (
  gewaehlt: BoardAggregat | undefined,
  optionen: BoardAggregat[],
): BoardAggregat | null => {
  const passt = (kandidat: BoardAggregat) =>
    optionen.some(
      (option) => option.art === kandidat.art && option.feld === kandidat.feld,
    );

  if (gewaehlt !== undefined && passt(gewaehlt)) {
    return gewaehlt;
  }

  return passt(STANDARD_AGGREGAT) ? STANDARD_AGGREGAT : (optionen[0] ?? null);
};

export type AggregatGeschaeft = {
  amount: number | null;
  currency: string | null;
  customFields?: Record<string, unknown> | null;
};

export type AggregatErgebnis =
  | { art: 'anzahl'; anzahl: number }
  | { art: 'werte'; zeilen: { waehrung: string | null; wert: number }[] };

const zahlAus = (wert: unknown): number | null => {
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return wert;
  }

  if (typeof wert === 'string' && wert.trim() !== '') {
    const zahl = Number(wert);

    return Number.isFinite(zahl) ? zahl : null;
  }

  return null;
};

const nachWaehrung = (
  a: { waehrung: string | null },
  b: { waehrung: string | null },
) =>
  a.waehrung === b.waehrung
    ? 0
    : a.waehrung === null || a.waehrung === 'EUR'
      ? -1
      : b.waehrung === null || b.waehrung === 'EUR'
        ? 1
        : a.waehrung.localeCompare(b.waehrung);

export const berechneAggregat = <G extends AggregatGeschaeft>(
  geschaefte: G[],
  aggregat: BoardAggregat,
  {
    feld,
    wahrscheinlichkeit,
  }: {
    feld: ZahlFeld | undefined;
    wahrscheinlichkeit: (geschaeft: G) => number;
  },
): AggregatErgebnis => {
  const eigenesKey = aggregat.feld.startsWith('custom:')
    ? aggregat.feld.slice('custom:'.length)
    : null;
  const werte = geschaefte.map((geschaeft) => ({
    geschaeft,
    wert:
      eigenesKey === null
        ? geschaeft.amount
        : zahlAus(geschaeft.customFields?.[eigenesKey]),
    waehrung:
      eigenesKey === null
        ? (geschaeft.currency ?? 'EUR')
        : (feld?.waehrung ?? null),
  }));

  if (aggregat.art === 'leer') {
    return {
      art: 'anzahl',
      anzahl: werte.filter((eintrag) => eintrag.wert === null).length,
    };
  }

  const gruppen = new Map<string | null, number[]>();

  for (const { geschaeft, wert, waehrung } of werte) {
    if (wert === null) {
      continue;
    }

    const gewichtet =
      aggregat.art === 'gewichtet'
        ? (wert * wahrscheinlichkeit(geschaeft)) / 100
        : wert;

    gruppen.set(waehrung, [...(gruppen.get(waehrung) ?? []), gewichtet]);
  }

  const zeilen = [...gruppen.entries()].map(([waehrung, liste]) => {
    const summe = liste.reduce((a, b) => a + b, 0);
    const wert =
      aggregat.art === 'durchschnitt'
        ? summe / liste.length
        : aggregat.art === 'min'
          ? Math.min(...liste)
          : aggregat.art === 'max'
            ? Math.max(...liste)
            : summe;

    return { waehrung, wert: Math.round(wert * 100) / 100 };
  });

  if (
    zeilen.length === 0 &&
    (aggregat.art === 'summe' || aggregat.art === 'gewichtet')
  ) {
    return {
      art: 'werte',
      zeilen: [
        {
          waehrung: eigenesKey === null ? 'EUR' : (feld?.waehrung ?? null),
          wert: 0,
        },
      ],
    };
  }

  return { art: 'werte', zeilen: zeilen.sort(nachWaehrung) };
};

const ART_TEXT: Record<AggregatArt, string> = {
  summe: 'Summe',
  gewichtet: 'Gewichtete Summe',
  durchschnitt: 'Durchschnitt',
  min: 'Kleinster Wert',
  max: 'Größter Wert',
  leer: 'Ohne Wert',
};

export const aggregatName = (
  aggregat: BoardAggregat,
  felder: ZahlFeld[],
): string => {
  const feld =
    felder.find((eintrag) => eintrag.feld === aggregat.feld)?.label ??
    aggregat.feld;

  return aggregat.art === 'leer'
    ? `Ohne ${feld}`
    : aggregat.art === 'gewichtet'
      ? `Gewichtete Summe ${feld}`
      : `${ART_TEXT[aggregat.art]} ${feld}`;
};

export const AGGREGAT_ZEICHEN: Record<AggregatArt, string> = {
  summe: '',
  gewichtet: 'gew.',
  durchschnitt: 'Ø',
  min: 'min.',
  max: 'max.',
  leer: 'ohne:',
};

export const aggregatText = (
  ergebnis: AggregatErgebnis,
  format: (wert: number, waehrung: string | null) => string,
): string =>
  ergebnis.art === 'anzahl'
    ? `${String(ergebnis.anzahl)} ${ergebnis.anzahl === 1 ? 'Geschäft' : 'Geschäfte'}`
    : ergebnis.zeilen.length === 0
      ? '—'
      : ergebnis.zeilen
          .map((zeile) => format(zeile.wert, zeile.waehrung))
          .join(' · ');
