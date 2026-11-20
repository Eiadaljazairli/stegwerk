const PREFIX = 'RE';

const DIGITS = 4;

export type ParsedNumber = { year: number; sequence: number };

export const formatInvoiceNumber = (year: number, sequence: number): string => {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(
      `Kein gültiges Jahr für eine Rechnungsnummer: ${String(year)}`,
    );
  }

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(
      `Keine gültige laufende Zahl für eine Rechnungsnummer: ${String(sequence)}`,
    );
  }

  return `${PREFIX}-${String(year)}-${String(sequence).padStart(DIGITS, '0')}`;
};

export const parseInvoiceNumber = (value: string): ParsedNumber | null => {
  const match = /^RE-(\d{4})-(\d{4,})$/u.exec(value.trim());

  if (match === null) {
    return null;
  }

  const sequence = Number(match[2]);

  return sequence < 1 ? null : { year: Number(match[1]), sequence };
};

export const missingNumbers = (numbers: string[]): string[] => {
  const perYear = new Map<number, Set<number>>();

  for (const value of numbers) {
    const parsed = parseInvoiceNumber(value);

    if (parsed === null) {
      continue;
    }

    const seen = perYear.get(parsed.year) ?? new Set<number>();

    seen.add(parsed.sequence);
    perYear.set(parsed.year, seen);
  }

  const gaps: string[] = [];

  for (const [year, seen] of [...perYear.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const highest = Math.max(...seen);

    for (let sequence = 1; sequence <= highest; sequence += 1) {
      if (!seen.has(sequence)) {
        gaps.push(formatInvoiceNumber(year, sequence));
      }
    }
  }

  return gaps;
};
