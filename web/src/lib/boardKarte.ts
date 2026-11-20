import { type BoardAggregat, istAggregat } from './boardAggregat';
import { type EingabeTyp } from './inlineWert';
import { type CustomField } from './types';
import { type Feldrecht } from './useFeldrechte';

export type KartenWahl = {
  felder: string[];
  kompakt: boolean;
  aggregat?: BoardAggregat;
};

export const FESTE_KARTENFELDER: { key: string; label: string }[] = [
  { key: 'company', label: 'Firma' },
  { key: 'amount', label: 'Betrag' },
  { key: 'closeDate', label: 'Abschluss' },
  { key: 'owner', label: 'Verantwortlich' },
  { key: 'lostReason', label: 'Verlustgrund' },
];

export const STANDARD_KARTE: KartenWahl = {
  felder: ['company', 'amount', 'closeDate'],
  kompakt: false,
};

const SCHLUESSEL = 'stegwerk.deals.karte';

export const leseKarte = (): KartenWahl => {
  try {
    const roh: unknown = JSON.parse(
      window.localStorage.getItem(SCHLUESSEL) ?? 'null',
    );

    if (
      typeof roh === 'object' &&
      roh !== null &&
      Array.isArray((roh as KartenWahl).felder)
    ) {
      const wahl = roh as KartenWahl;

      return {
        felder: wahl.felder.filter(
          (feld): feld is string => typeof feld === 'string',
        ),
        kompakt: wahl.kompakt === true,
        ...(istAggregat(wahl.aggregat) ? { aggregat: wahl.aggregat } : {}),
      };
    }
  } catch {}

  return STANDARD_KARTE;
};

export const merkeKarte = (wahl: KartenWahl): void => {
  try {
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(wahl));
  } catch {}
};

export const umschalten = (
  wahl: KartenWahl,
  feld: string,
  reihenfolge: string[],
): KartenWahl => {
  const an = wahl.felder.includes(feld)
    ? wahl.felder.filter((eintrag) => eintrag !== feld)
    : [...wahl.felder, feld];

  return {
    ...wahl,
    felder: [...an].sort(
      (a, b) => reihenfolge.indexOf(a) - reihenfolge.indexOf(b),
    ),
  };
};

const EIGENE_EINGABE: Partial<Record<CustomField['type'], EingabeTyp>> = {
  TEXT: 'text',
  URL: 'text',
  PHONE: 'text',
  EMAIL: 'email',
  NUMBER: 'number',
  CURRENCY: 'number',
  DATE: 'date',
  SELECT: 'select',
  RATING: 'select',
};

export const kartenFeldEingabe = (
  feld: string,
  eigenerTyp?: CustomField['type'],
): EingabeTyp | null => {
  if (feld.startsWith('custom:')) {
    return eigenerTyp === undefined
      ? null
      : (EIGENE_EINGABE[eigenerTyp] ?? null);
  }

  switch (feld) {
    case 'amount':
      return 'number';
    case 'closeDate':
      return 'date';
    case 'owner':
      return 'select';
    case 'lostReason':
      return 'text';
    default:
      return null;
  }
};

export const kartenFeldBearbeitbar = (
  darfAendern: boolean,
  recht: Feldrecht,
  eingabe: EingabeTyp | null,
): boolean => darfAendern && recht === 'alle' && eingabe !== null;
