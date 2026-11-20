export type QuoteLine = {
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
};

export type TaxGroup = {
  ratePercent: number;
  netCents: number;
  taxCents: number;
};

export type QuoteTotals = {
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxGroups: TaxGroup[];
};

const aufDenCent = (betrag: number): number =>
  Math.sign(betrag) * Math.round(Math.abs(betrag));

export const lineNetCents = (line: QuoteLine): number => {
  const mengeTausendstel = BigInt(Math.round(line.quantity * 1000));
  const rabattHundertstel = BigInt(Math.round(line.discountPercent * 100));
  const zaehler =
    mengeTausendstel *
    BigInt(Math.round(line.unitPriceCents)) *
    (10000n - rabattHundertstel);
  const nenner = 10_000_000n;
  const betrag = zaehler < 0n ? -zaehler : zaehler;
  const gerundet = (betrag * 2n + nenner) / (2n * nenner);

  return Number(zaehler < 0n ? -gerundet : gerundet);
};

export const quoteTotals = (
  lines: QuoteLine[],
  smallBusiness = false,
): QuoteTotals => {
  const netByRate = new Map<number, number>();
  let netCents = 0;

  for (const line of lines) {
    const net = lineNetCents(line);

    netCents += net;

    const rate = smallBusiness ? 0 : line.taxRatePercent;

    netByRate.set(rate, (netByRate.get(rate) ?? 0) + net);
  }

  const taxGroups = [...netByRate.entries()]
    .sort(([left], [right]) => left - right)
    .map(([ratePercent, groupNet]) => ({
      ratePercent,
      netCents: groupNet,
      taxCents: aufDenCent((groupNet * ratePercent) / 100),
    }));

  const taxCents = taxGroups.reduce((sum, group) => sum + group.taxCents, 0);

  return {
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
    taxGroups,
  };
};

export const MAX_BELEG_CENTS = 2_147_483_647;

export const belegFehler = (lines: QuoteLine[]): string | null => {
  for (const line of lines) {
    const tausendstel = line.quantity * 1000;

    if (Math.abs(tausendstel - Math.round(tausendstel)) > 1e-6) {
      return 'Eine Menge hat höchstens drei Nachkommastellen.';
    }
  }

  const totals = quoteTotals(lines);
  const betraege = [
    totals.netCents,
    totals.grossCents,
    ...lines.map(lineNetCents),
    ...totals.taxGroups.flatMap((group) => [group.netCents, group.taxCents]),
  ];

  if (betraege.some((betrag) => Math.abs(betrag) > MAX_BELEG_CENTS)) {
    return 'Ein Beleg kann höchstens 21.474.836,47 € ausweisen.';
  }

  return null;
};
