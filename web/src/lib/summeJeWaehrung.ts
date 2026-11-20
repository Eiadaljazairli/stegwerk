export const summeJeWaehrung = (
  eintraege: { amount: number | null; currency: string | null }[],
): { waehrung: string; summe: number }[] => {
  const summen = new Map<string, number>();

  for (const { amount, currency } of eintraege) {
    if (amount === null) {
      continue;
    }

    const waehrung = currency ?? 'EUR';
    summen.set(waehrung, (summen.get(waehrung) ?? 0) + amount);
  }

  return [...summen.entries()]
    .map(([waehrung, summe]) => ({ waehrung, summe }))
    .sort((a, b) =>
      a.waehrung === 'EUR'
        ? -1
        : b.waehrung === 'EUR'
          ? 1
          : a.waehrung.localeCompare(b.waehrung),
    );
};
