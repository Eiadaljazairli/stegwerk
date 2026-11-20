export type DokuStueck =
  | { art: 'text'; text: string }
  | { art: 'code'; text: string }
  | { art: 'fett'; kinder: DokuStueck[] }
  | { art: 'kursiv'; kinder: DokuStueck[] }
  | { art: 'link'; ziel: string; kinder: DokuStueck[] };

export type DokuBlock =
  | {
      art: 'ueberschrift';
      stufe: 1 | 2 | 3 | 4;
      id: string;
      inhalt: DokuStueck[];
    }
  | { art: 'absatz'; inhalt: DokuStueck[] }
  | { art: 'liste'; geordnet: boolean; punkte: DokuStueck[][] }
  | { art: 'code'; sprache: string; text: string }
  | { art: 'tabelle'; kopf: DokuStueck[][]; zeilen: DokuStueck[][][] };

const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^()\s]+)\)|\*([^*\s][^*\n]*?)\*/gu;

export const zerlegeZeile = (zeile: string): DokuStueck[] => {
  const stuecke: DokuStueck[] = [];
  let stelle = 0;

  for (const treffer of zeile.matchAll(INLINE)) {
    const anfang = treffer.index ?? 0;

    if (anfang > stelle) {
      stuecke.push({ art: 'text', text: zeile.slice(stelle, anfang) });
    }

    const [, code, fett, linkText, linkZiel, kursiv] = treffer;

    if (code !== undefined) {
      stuecke.push({ art: 'code', text: code });
    } else if (fett !== undefined) {
      stuecke.push({ art: 'fett', kinder: zerlegeZeile(fett) });
    } else if (linkText !== undefined && linkZiel !== undefined) {
      stuecke.push({
        art: 'link',
        ziel: linkZiel,
        kinder: zerlegeZeile(linkText),
      });
    } else {
      stuecke.push({
        art: 'kursiv',
        kinder: zerlegeZeile(kursiv ?? ''),
      });
    }

    stelle = anfang + treffer[0].length;
  }

  if (stelle < zeile.length) {
    stuecke.push({ art: 'text', text: zeile.slice(stelle) });
  }

  return stuecke;
};

export const sprungmarke = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/ß/gu, 'ss')
    .replace(/[`*_[\]()]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

const UEBERSCHRIFT = /^(#{1,4})\s+(.*)$/u;
const PUNKT = /^[-*]\s+(.*)$/u;
const NUMMER = /^\d{1,3}\.\s+(.*)$/u;
const ZAUN = /^```(\S*)\s*$/u;

const zellen = (zeile: string): string[] =>
  zeile
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((zelle) => zelle.trim());

const istTrenner = (zeile: string): boolean =>
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/u.test(zeile.trim());

const beginntBlock = (zeile: string): boolean =>
  UEBERSCHRIFT.test(zeile) ||
  PUNKT.test(zeile) ||
  NUMMER.test(zeile) ||
  ZAUN.test(zeile) ||
  zeile.trim().startsWith('|');

export const zerlegeDoku = (quelle: string): DokuBlock[] => {
  const zeilen = quelle.replace(/\r\n/gu, '\n').split('\n');
  const bloecke: DokuBlock[] = [];
  const vergeben = new Map<string, number>();
  let i = 0;

  const eindeutig = (id: string): string => {
    const schon = vergeben.get(id) ?? 0;

    vergeben.set(id, schon + 1);

    return schon === 0 ? id : `${id}-${String(schon + 1)}`;
  };

  while (i < zeilen.length) {
    const zeile = zeilen[i];

    if (zeile.trim() === '') {
      i += 1;
      continue;
    }

    const zaun = ZAUN.exec(zeile);

    if (zaun !== null) {
      const inhalt: string[] = [];

      i += 1;

      while (i < zeilen.length && !/^```\s*$/u.test(zeilen[i])) {
        inhalt.push(zeilen[i]);
        i += 1;
      }

      i += 1;
      bloecke.push({ art: 'code', sprache: zaun[1], text: inhalt.join('\n') });
      continue;
    }

    const ueberschrift = UEBERSCHRIFT.exec(zeile);

    if (ueberschrift !== null) {
      const text = ueberschrift[2].trim();

      bloecke.push({
        art: 'ueberschrift',
        stufe: ueberschrift[1].length as 1 | 2 | 3 | 4,
        id: eindeutig(sprungmarke(text)),
        inhalt: zerlegeZeile(text),
      });
      i += 1;
      continue;
    }

    if (
      zeile.trim().startsWith('|') &&
      i + 1 < zeilen.length &&
      istTrenner(zeilen[i + 1])
    ) {
      const kopf = zellen(zeile).map(zerlegeZeile);
      const reihen: DokuStueck[][][] = [];

      i += 2;

      while (i < zeilen.length && zeilen[i].trim().startsWith('|')) {
        reihen.push(zellen(zeilen[i]).map(zerlegeZeile));
        i += 1;
      }

      bloecke.push({ art: 'tabelle', kopf, zeilen: reihen });
      continue;
    }

    const geordnet = NUMMER.test(zeile);

    if (geordnet || PUNKT.test(zeile)) {
      const muster = geordnet ? NUMMER : PUNKT;
      const punkte: string[] = [];

      while (i < zeilen.length) {
        const aktuell = zeilen[i];
        const treffer = muster.exec(aktuell);

        if (treffer !== null) {
          punkte.push(treffer[1].trim());
        } else if (
          /^\s{2,}\S/u.test(aktuell) &&
          punkte.length > 0 &&
          !ZAUN.test(aktuell.trim())
        ) {
          punkte[punkte.length - 1] += ` ${aktuell.trim()}`;
        } else {
          break;
        }

        i += 1;
      }

      bloecke.push({
        art: 'liste',
        geordnet,
        punkte: punkte.map(zerlegeZeile),
      });
      continue;
    }

    const absatz: string[] = [zeile.trim()];

    i += 1;

    while (
      i < zeilen.length &&
      zeilen[i].trim() !== '' &&
      !beginntBlock(zeilen[i])
    ) {
      absatz.push(zeilen[i].trim());
      i += 1;
    }

    bloecke.push({ art: 'absatz', inhalt: zerlegeZeile(absatz.join(' ')) });
  }

  return bloecke;
};

export const alsText = (stuecke: DokuStueck[]): string =>
  stuecke
    .map((stueck) =>
      stueck.art === 'text' || stueck.art === 'code'
        ? stueck.text
        : alsText(stueck.kinder),
    )
    .join('');
