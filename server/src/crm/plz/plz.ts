import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PlzOrt = { ort: string; bundesland: string | null };

type PlzDatei = {
  quelle: string;
  laender: string[];
  plz: Record<string, [string, number][]>;
};

let geladen: PlzDatei | null = null;

const datei = (): PlzDatei => {
  geladen ??= JSON.parse(
    readFileSync(join(__dirname, 'plz-de.json'), 'utf8'),
  ) as PlzDatei;

  return geladen;
};

export const istDeutschePlz = (plz: string): boolean =>
  /^\d{5}$/.test(plz.trim());

export const orteZurPlz = (plz: string): PlzOrt[] => {
  const sauber = plz.trim();

  if (!istDeutschePlz(sauber)) {
    return [];
  }

  const { plz: liste, laender } = datei();

  return (liste[sauber] ?? []).map(([ort, land]) => ({
    ort,
    bundesland: land >= 0 ? (laender[land] ?? null) : null,
  }));
};

export const meintDeutschland = (land: string | null | undefined): boolean =>
  ['', 'de', 'deu', 'deutschland', 'germany'].includes(
    (land ?? '').trim().toLowerCase(),
  );
