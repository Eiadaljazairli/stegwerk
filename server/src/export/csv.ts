export const DELIMITER = ';';

export const BOM = '﻿';

const NEWLINE = '\r\n';

const FORMULA_STARTS = ['=', '+', '-', '@', '\t', '\r'];

const needsQuoting = (value: string): boolean =>
  value.includes(DELIMITER) ||
  value.includes('"') ||
  value.includes('\n') ||
  value.includes('\r');

export const escapeCell = (value: string): string => {
  const guarded = FORMULA_STARTS.some((start) => value.startsWith(start))
    ? `'${value}`
    : value;

  return needsQuoting(guarded) ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
};

export const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Ja' : 'Nein';
  }

  if (typeof value === 'number') {
    return value.toLocaleString('de-DE', { maximumFractionDigits: 4 });
  }

  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');

    return `${day}.${month}.${String(value.getFullYear())}`;
  }

  if (typeof value === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/u.exec(value);

    return iso === null ? value : `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  return String(value);
};

export const csvLine = (cells: unknown[]): string =>
  cells.map((cell) => escapeCell(formatCell(cell))).join(DELIMITER);

export const csvHeader = (headers: string[]): string =>
  BOM + headers.map((header) => escapeCell(header)).join(DELIMITER) + NEWLINE;

export const csvRow = (cells: unknown[]): string => csvLine(cells) + NEWLINE;

export const sniffDelimiter = (csv: string): ',' | ';' => {
  const firstLine = csv.split(/\r?\n/u)[0] ?? '';
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;

  for (const character of firstLine) {
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && character === ',') {
      commas += 1;
    } else if (!inQuotes && character === ';') {
      semicolons += 1;
    }
  }

  return semicolons > commas ? ';' : ',';
};
