import { berlinDate, berlinWandzeitSql } from '../calendar/berlin-time';
import { type KachelZeitraum, type Zeitraster } from './kacheln';

const MONATE = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const STANDARD_ANZAHL: Record<Zeitraster, number> = {
  woche: 12,
  monat: 12,
  quartal: 8,
  jahr: 5,
};

export const MAX_ZEIT_BALKEN = 60;

const POSTGRES_EINHEIT: Record<Zeitraster, string> = {
  woche: 'week',
  monat: 'month',
  quartal: 'quarter',
  jahr: 'year',
};

const SCHLUESSEL_FORMAT: Record<Zeitraster, string> = {
  woche: 'YYYY-MM-DD',
  monat: 'YYYY-MM',
  quartal: 'YYYY-"Q"Q',
  jahr: 'YYYY',
};

export const zeitAusdruck = (raster: Zeitraster, datum: string): string =>
  `to_char(date_trunc('${POSTGRES_EINHEIT[raster]}', ${datum}), '${SCHLUESSEL_FORMAT[raster]}')`;

export const standardFenster = (raster: Zeitraster, datum: string): string => {
  const zurueck = STANDARD_ANZAHL[raster] - 1;
  const intervall =
    raster === 'quartal'
      ? `${String(zurueck * 3)} months`
      : `${String(zurueck)} ${POSTGRES_EINHEIT[raster]}s`;

  return `${datum} >= date_trunc('${POSTGRES_EINHEIT[raster]}', ${berlinWandzeitSql('now()')}) - interval '${intervall}'`;
};

const zwei = (zahl: number): string => String(zahl).padStart(2, '0');

export const abschnittsAnfang = (raster: Zeitraster, tag: Date): Date => {
  const jahr = tag.getFullYear();
  const monat = tag.getMonth();

  switch (raster) {
    case 'woche': {
      const montag = new Date(jahr, monat, tag.getDate());

      montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7));

      return montag;
    }
    case 'monat':
      return new Date(jahr, monat, 1);
    case 'quartal':
      return new Date(jahr, monat - (monat % 3), 1);
    default:
      return new Date(jahr, 0, 1);
  }
};

export const naechsterAbschnitt = (raster: Zeitraster, anfang: Date): Date => {
  const neu = new Date(anfang);

  switch (raster) {
    case 'woche':
      neu.setDate(neu.getDate() + 7);
      break;
    case 'monat':
      neu.setMonth(neu.getMonth() + 1);
      break;
    case 'quartal':
      neu.setMonth(neu.getMonth() + 3);
      break;
    default:
      neu.setFullYear(neu.getFullYear() + 1);
  }

  return neu;
};

export const zeitSchluessel = (raster: Zeitraster, anfang: Date): string => {
  const jahr = String(anfang.getFullYear());

  switch (raster) {
    case 'woche':
      return `${jahr}-${zwei(anfang.getMonth() + 1)}-${zwei(anfang.getDate())}`;
    case 'monat':
      return `${jahr}-${zwei(anfang.getMonth() + 1)}`;
    case 'quartal':
      return `${jahr}-Q${String(Math.floor(anfang.getMonth() / 3) + 1)}`;
    default:
      return jahr;
  }
};

export const kalenderwoche = (tag: Date): { woche: number; jahr: number } => {
  const donnerstag = new Date(
    Date.UTC(tag.getFullYear(), tag.getMonth(), tag.getDate()),
  );

  donnerstag.setUTCDate(
    donnerstag.getUTCDate() + 3 - ((donnerstag.getUTCDay() + 6) % 7),
  );

  const jahresanfang = new Date(Date.UTC(donnerstag.getUTCFullYear(), 0, 1));

  return {
    woche: Math.ceil(
      ((donnerstag.getTime() - jahresanfang.getTime()) / 86_400_000 + 1) / 7,
    ),
    jahr: donnerstag.getUTCFullYear(),
  };
};

export const zeitLabel = (raster: Zeitraster, anfang: Date): string => {
  const kurzJahr = String(anfang.getFullYear()).slice(2);

  switch (raster) {
    case 'woche': {
      const { woche, jahr } = kalenderwoche(anfang);

      return `KW ${String(woche)} ’${String(jahr).slice(2)}`;
    }
    case 'monat':
      return `${MONATE[anfang.getMonth()]} ${kurzJahr}`;
    case 'quartal':
      return `Q${String(Math.floor(anfang.getMonth() / 3) + 1)} ${kurzJahr}`;
    default:
      return String(anfang.getFullYear());
  }
};

export const ersterAbschnitt = (
  raster: Zeitraster,
  zeitraum: KachelZeitraum | null,
  jetzt: Date,
): Date => {
  if (zeitraum === '30' || zeitraum === '90' || zeitraum === '365') {
    const damals = new Date(jetzt);

    damals.setDate(damals.getDate() - Number(zeitraum));

    return abschnittsAnfang(raster, damals);
  }

  if (zeitraum === 'jahr') {
    return abschnittsAnfang(raster, new Date(jetzt.getFullYear(), 0, 1));
  }

  let anfang = abschnittsAnfang(raster, jetzt);

  for (let schritt = 1; schritt < STANDARD_ANZAHL[raster]; schritt += 1) {
    anfang = vorigerAbschnitt(raster, anfang);
  }

  return anfang;
};

const vorigerAbschnitt = (raster: Zeitraster, anfang: Date): Date => {
  const neu = new Date(anfang);

  switch (raster) {
    case 'woche':
      neu.setDate(neu.getDate() - 7);
      break;
    case 'monat':
      neu.setMonth(neu.getMonth() - 1);
      break;
    case 'quartal':
      neu.setMonth(neu.getMonth() - 3);
      break;
    default:
      neu.setFullYear(neu.getFullYear() - 1);
  }

  return neu;
};

export const abschnitte = (
  raster: Zeitraster,
  zeitraum: KachelZeitraum | null,
  jetzt: Date = new Date(),
): { schluessel: string; label: string }[] => {
  const ergebnis: { schluessel: string; label: string }[] = [];
  const [j, m, t] = berlinDate(jetzt).split('-').map(Number);
  const heute = new Date(j, m - 1, t);

  for (
    let anfang = ersterAbschnitt(raster, zeitraum, heute);
    anfang <= heute;
    anfang = naechsterAbschnitt(raster, anfang)
  ) {
    ergebnis.push({
      schluessel: zeitSchluessel(raster, anfang),
      label: zeitLabel(raster, anfang),
    });
  }

  return ergebnis.slice(-MAX_ZEIT_BALKEN);
};
