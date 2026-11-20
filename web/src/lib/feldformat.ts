import { type Adresse, type CustomField, type Link } from './types';

export const zahlText = (
  field: Pick<CustomField, 'nachkommastellen' | 'zahlformat'>,
  wert: number,
): string => {
  const stellen = field.nachkommastellen ?? undefined;
  const text = wert.toLocaleString('de-DE', {
    ...(stellen === undefined
      ? {}
      : { minimumFractionDigits: stellen, maximumFractionDigits: stellen }),
  });

  return field.zahlformat === 'prozent' ? `${text} %` : text;
};

const TAG_MS = 86_400_000;

const tagNummer = (iso: string): number => {
  const [jahr, monat, tag] = iso.slice(0, 10).split('-').map(Number);

  return Date.UTC(jahr, monat - 1, tag) / TAG_MS;
};

export const relativesDatum = (iso: string, heute = new Date()): string => {
  const differenz =
    tagNummer(iso) -
    Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate()) / TAG_MS;
  const format = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
  const betrag = Math.abs(differenz);

  if (betrag < 7) {
    return format.format(differenz, 'day');
  }

  if (betrag < 60) {
    return format.format(Math.round(differenz / 7), 'week');
  }

  if (betrag < 730) {
    return format.format(Math.round(differenz / 30), 'month');
  }

  return format.format(Math.round(differenz / 365), 'year');
};

export const tagText = (iso: string): string => {
  const [jahr, monat, tag] = iso.slice(0, 10).split('-');

  return `${tag}.${monat}.${jahr}`;
};

export const datumText = (
  field: Pick<CustomField, 'datumsformat'>,
  iso: string,
  heute = new Date(),
): string =>
  field.datumsformat === 'relativ' ? relativesDatum(iso, heute) : tagText(iso);

export const ADRESS_TEILE: { key: keyof Adresse; label: string }[] = [
  { key: 'strasse', label: 'Straße' },
  { key: 'zusatz', label: 'Zusatz' },
  { key: 'plz', label: 'PLZ' },
  { key: 'ort', label: 'Ort' },
  { key: 'bundesland', label: 'Bundesland' },
  { key: 'land', label: 'Land' },
];

export const istAdresse = (wert: unknown): wert is Adresse =>
  typeof wert === 'object' && wert !== null && !Array.isArray(wert);

export const adresseZeilen = (adresse: Adresse): string[] =>
  [
    adresse.strasse,
    adresse.zusatz,
    [adresse.plz, adresse.ort].filter(Boolean).join(' '),
    adresse.bundesland,
    adresse.land,
  ].filter((zeile): zeile is string => zeile !== undefined && zeile !== '');

export const istLinkListe = (wert: unknown): wert is Link[] =>
  Array.isArray(wert) &&
  wert.every(
    (eintrag) =>
      typeof eintrag === 'object' &&
      eintrag !== null &&
      typeof (eintrag as Link).url === 'string',
  );

export const linkAnzeige = (
  link: Link,
): { text: string; ziel: string | null } => ({
  text: link.label ?? link.url.replace(/^https:\/\//u, '').replace(/\/$/u, ''),
  ziel: link.url.startsWith('https://') ? link.url : null,
});
