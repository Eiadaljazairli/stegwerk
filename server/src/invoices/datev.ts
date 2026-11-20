import { type TaxGroup } from '../quotes/quote-totals';
import { BEFREIUNGEN, type Steuerbefreiung } from '../quotes/steuerbefreiung';

export type Kontenrahmen = 'SKR03' | 'SKR04';

export type DatevEinstellungen = {
  beraternummer: string | null;
  mandantennummer: string | null;
  kontenrahmen: Kontenrahmen;
};

export type DatevRechnung = {
  number: string;
  issuedOn: string;
  customerName: string | null;
  smallBusiness: boolean;
  taxExemption?: Steuerbefreiung | null;
  taxGroups: TaxGroup[];
};

export const SAMMELDEBITOR = 10000;

export const erloeskonto = (
  kontenrahmen: Kontenrahmen,
  ratePercent: number,
  smallBusiness: boolean,
  befreiung: Steuerbefreiung | null = null,
): number => {
  const skr03 = kontenrahmen === 'SKR03';

  if (smallBusiness) {
    return skr03 ? 8195 : 4185;
  }

  if (ratePercent === 0 && befreiung !== null) {
    const angaben = BEFREIUNGEN[befreiung];

    return skr03 ? angaben.skr03 : angaben.skr04;
  }

  if (ratePercent === 19) {
    return skr03 ? 8400 : 4400;
  }

  if (ratePercent === 7) {
    return skr03 ? 8300 : 4300;
  }

  return skr03 ? 8200 : 4200;
};

export type DatevLuecke = string;

export const datevLuecken = (
  einstellungen: DatevEinstellungen,
): DatevLuecke[] => {
  const luecken: DatevLuecke[] = [];

  if (!/^\d{4,7}$/u.test(einstellungen.beraternummer ?? '')) {
    luecken.push('DATEV-Beraternummer (4 bis 7 Ziffern, von der Kanzlei)');
  }

  if (!/^\d{1,5}$/u.test(einstellungen.mandantennummer ?? '')) {
    luecken.push('DATEV-Mandantennummer (1 bis 5 Ziffern, von der Kanzlei)');
  }

  return luecken;
};

const text = (wert: string, laenge: number): string => {
  const einzeilig = wert.replace(/\s*[\r\n;]+\s*/gu, ' ');
  const sicher = /^[=+\-@\t]/u.test(einzeilig) ? `'${einzeilig}` : einzeilig;

  return `"${sicher.slice(0, laenge).replace(/"/gu, '""')}"`;
};

const betrag = (cent: number): string => {
  const abs = Math.abs(cent);

  return `${String(Math.floor(abs / 100))},${String(abs % 100).padStart(2, '0')}`;
};

const ohneStriche = (isoDatum: string): string => isoDatum.replace(/-/gu, '');

const belegdatum = (isoDatum: string): string =>
  `${isoDatum.slice(8, 10)}${isoDatum.slice(5, 7)}`;

const zeitstempel = (jetzt: Date): string => {
  const iso = jetzt.toISOString();

  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${iso.slice(20, 23)}`;
};

export const FELDNAMEN = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
];

export const datevBuchungsstapel = (
  einstellungen: DatevEinstellungen,
  rechnungen: DatevRechnung[],
  von: string,
  bis: string,
  jetzt: Date,
): string => {
  const kopf = [
    '"EXTF"',
    '700',
    '21',
    '"Buchungsstapel"',
    '13',
    zeitstempel(jetzt),
    '',
    '"RE"',
    '""',
    '""',
    einstellungen.beraternummer ?? '',
    einstellungen.mandantennummer ?? '',
    `${von.slice(0, 4)}0101`,
    '4',
    ohneStriche(von),
    ohneStriche(bis),
    text(
      `Rechnungen ${von.slice(8, 10)}.${von.slice(5, 7)}.-${bis.slice(8, 10)}.${bis.slice(5, 7)}.${bis.slice(0, 4)}`,
      30,
    ),
    '""',
    '1',
    '0',
    '0',
    '"EUR"',
    '',
    '""',
    '',
    '',
    `"${einstellungen.kontenrahmen.slice(3)}"`,
    '',
    '',
    '""',
    '""',
  ].join(';');

  const zeilen = rechnungen.flatMap((rechnung) =>
    rechnung.taxGroups
      .filter((gruppe) => gruppe.netCents + gruppe.taxCents !== 0)
      .map((gruppe) => {
        const brutto = gruppe.netCents + gruppe.taxCents;

        return [
          betrag(brutto),
          brutto >= 0 ? '"S"' : '"H"',
          '"EUR"',
          '',
          '',
          '""',
          String(SAMMELDEBITOR),
          String(
            erloeskonto(
              einstellungen.kontenrahmen,
              gruppe.ratePercent,
              rechnung.smallBusiness,
              rechnung.taxExemption ?? null,
            ),
          ),
          '""',
          belegdatum(rechnung.issuedOn),
          text(rechnung.number, 36),
          '""',
          '',
          text(rechnung.customerName ?? rechnung.number, 60),
        ].join(';');
      }),
  );

  return [kopf, FELDNAMEN.join(';'), ...zeilen, ''].join('\r\n');
};

const SONDERZEICHEN: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  Š: 0x8a,
  š: 0x9a,
  Ž: 0x8e,
  ž: 0x9e,
  Œ: 0x8c,
  œ: 0x9c,
};

export const alsWindows1252 = (inhalt: string): Buffer => {
  const bytes: number[] = [];

  for (const zeichen of inhalt) {
    const code = zeichen.codePointAt(0) ?? 0x3f;
    const sonder = SONDERZEICHEN[zeichen];

    if (sonder !== undefined) {
      bytes.push(sonder);
    } else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
    } else {
      bytes.push(0x3f);
    }
  }

  return Buffer.from(bytes);
};
