export type Stueck =
  | { art: 'text'; text: string }
  | { art: 'fett'; kinder: Stueck[] }
  | { art: 'kursiv'; kinder: Stueck[] }
  | { art: 'link'; ziel: string; kinder: Stueck[] }
  | { art: 'erwaehnung'; name: string; id: string }
  | { art: 'umbruch' };

export type Block =
  | { art: 'absatz'; inhalt: Stueck[] }
  | { art: 'ueberschrift'; stufe: 1 | 2 | 3; inhalt: Stueck[] }
  | { art: 'liste'; geordnet: boolean; punkte: Stueck[][] }
  | {
      art: 'checkliste';
      punkte: { erledigt: boolean; inhalt: Stueck[]; nummer: number }[];
    };

const ERLAUBT = /^(?:https?:\/\/|mailto:|tel:)/iu;

export const sicheresZiel = (ziel: string): boolean => ERLAUBT.test(ziel);

const UEBERSCHRIFT = /^\s{0,3}(#{1,3})\s+(.*)$/u;
const HAKEN = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/u;
const PUNKT = /^\s*[-*]\s+(.*)$/u;
const NUMMER = /^\s*\d{1,3}[.)]\s+(.*)$/u;

const INLINE =
  /@\[([^\]\n]{1,120})\]\(nutzer:([0-9a-fA-F-]{36})\)|\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)|\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|_([^_\s][^_\n]*?)_|(https?:\/\/(?:[^\s<>()"'\\]|\\[_#@*])+)|\\([\\[\]()@*_#<>])/gu;

const WORT = /[\p{L}\p{N}_*]/u;

const ohneSchlusszeichen = (adresse: string): [string, string] => {
  const treffer = /[.,;:!?]+$/u.exec(adresse);

  return treffer === null
    ? [adresse, '']
    : [adresse.slice(0, treffer.index), treffer[0]];
};

const textStueck = (text: string, ziel: Stueck[]): void => {
  if (text === '') {
    return;
  }

  const letztes = ziel.at(-1);

  if (letztes?.art === 'text') {
    letztes.text += text;
  } else {
    ziel.push({ art: 'text', text });
  }
};

export const zerlegeZeile = (zeile: string, tiefe = 0): Stueck[] => {
  const stuecke: Stueck[] = [];
  const muster = new RegExp(INLINE.source, INLINE.flags);
  let bis = 0;
  let treffer: RegExpExecArray | null;

  while ((treffer = muster.exec(zeile)) !== null) {
    const start = treffer.index;
    const ganz = treffer[0];
    const [, erwName, erwId, linkText, linkZiel, fett, kursivStern] = treffer;
    const kursivStrich = treffer[7];
    const nackt = treffer[8];
    const maskiert = treffer[9];
    let stueck: Stueck | null = null;
    let ende = start + ganz.length;

    if (erwName !== undefined && erwId !== undefined) {
      stueck = { art: 'erwaehnung', name: erwName, id: erwId.toLowerCase() };
    } else if (linkText !== undefined && linkZiel !== undefined) {
      stueck = sicheresZiel(linkZiel)
        ? {
            art: 'link',
            ziel: linkZiel,
            kinder: tiefe < 2 ? zerlegeZeile(linkText, tiefe + 1) : [],
          }
        : null;
    } else if (fett !== undefined) {
      stueck =
        tiefe < 2
          ? { art: 'fett', kinder: zerlegeZeile(fett, tiefe + 1) }
          : { art: 'text', text: fett };
    } else if (kursivStern !== undefined || kursivStrich !== undefined) {
      const davor = start > 0 ? zeile[start - 1] : '';
      const danach = zeile[ende] ?? '';
      const inhalt = kursivStern ?? kursivStrich ?? '';

      stueck =
        WORT.test(davor) || WORT.test(danach) || /\s$/u.test(inhalt)
          ? null
          : tiefe < 2
            ? { art: 'kursiv', kinder: zerlegeZeile(inhalt, tiefe + 1) }
            : { art: 'text', text: inhalt };
    } else if (nackt !== undefined) {
      const [roh, rest] = ohneSchlusszeichen(nackt);
      const adresse = roh.replace(/\\([_#@*])/gu, '$1');

      stueck = {
        art: 'link',
        ziel: adresse,
        kinder: [{ art: 'text', text: adresse }],
      };
      ende -= rest.length;
    } else if (maskiert !== undefined) {
      stueck = { art: 'text', text: maskiert };
    }

    if (stueck === null) {
      textStueck(zeile.slice(bis, start + 1), stuecke);
      bis = start + 1;
      muster.lastIndex = start + 1;
      continue;
    }

    textStueck(zeile.slice(bis, start), stuecke);

    if (maskiert !== undefined) {
      textStueck(maskiert, stuecke);
    } else {
      stuecke.push(stueck);
    }

    bis = ende;
    muster.lastIndex = ende;
  }

  textStueck(zeile.slice(bis), stuecke);

  return stuecke;
};

const mitUmbruechen = (zeilen: string[]): Stueck[] =>
  zeilen.flatMap((zeile, index) =>
    index === 0
      ? zerlegeZeile(zeile)
      : [{ art: 'umbruch' } as Stueck, ...zerlegeZeile(zeile)],
  );

export const zerlege = (text: string): Block[] => {
  const bloecke: Block[] = [];
  let absatz: string[] = [];
  let haken = 0;

  const absatzSchliessen = () => {
    if (absatz.length > 0) {
      bloecke.push({ art: 'absatz', inhalt: mitUmbruechen(absatz) });
      absatz = [];
    }
  };

  for (const zeile of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const ueberschrift = UEBERSCHRIFT.exec(zeile);
    const hakenTreffer = HAKEN.exec(zeile);
    const punkt = PUNKT.exec(zeile);
    const nummer = NUMMER.exec(zeile);
    const letzter = bloecke.at(-1);

    if (zeile.trim() === '') {
      absatzSchliessen();
    } else if (ueberschrift !== null) {
      absatzSchliessen();
      bloecke.push({
        art: 'ueberschrift',
        stufe: ueberschrift[1].length as 1 | 2 | 3,
        inhalt: zerlegeZeile(ueberschrift[2]),
      });
    } else if (hakenTreffer !== null) {
      absatzSchliessen();

      const eintrag = {
        erledigt: hakenTreffer[1] !== ' ',
        inhalt: zerlegeZeile(hakenTreffer[2]),
        nummer: haken,
      };

      haken += 1;

      if (letzter?.art === 'checkliste' && absatz.length === 0) {
        letzter.punkte.push(eintrag);
      } else {
        bloecke.push({ art: 'checkliste', punkte: [eintrag] });
      }
    } else if (punkt !== null || nummer !== null) {
      absatzSchliessen();

      const geordnet = punkt === null;
      const inhalt = zerlegeZeile((punkt ?? nummer)?.[1] ?? '');

      if (letzter?.art === 'liste' && letzter.geordnet === geordnet) {
        letzter.punkte.push(inhalt);
      } else {
        bloecke.push({ art: 'liste', geordnet, punkte: [inhalt] });
      }
    } else {
      absatz.push(zeile);
    }
  }

  absatzSchliessen();

  return bloecke;
};

export const schalteHaken = (text: string, nummer: number): string => {
  let gezaehlt = -1;

  return text
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((zeile) => {
      if (!HAKEN.test(zeile)) {
        return zeile;
      }

      gezaehlt += 1;

      return gezaehlt === nummer
        ? zeile.replace(/\[([ xX])\]/u, (_ganz, alt: string) =>
            alt === ' ' ? '[x]' : '[ ]',
          )
        : zeile;
    })
    .join('\n');
};

export const alsKlartext = (text: string): string => {
  const flach = (stuecke: Stueck[]): string =>
    stuecke
      .map((stueck) =>
        stueck.art === 'text'
          ? stueck.text
          : stueck.art === 'erwaehnung'
            ? `@${stueck.name}`
            : stueck.art === 'umbruch'
              ? ' '
              : flach(stueck.kinder),
      )
      .join('');

  return zerlege(text)
    .map((block) =>
      block.art === 'absatz' || block.art === 'ueberschrift'
        ? flach(block.inhalt)
        : block.art === 'liste'
          ? block.punkte.map(flach).join(' · ')
          : block.punkte.map((punkt) => flach(punkt.inhalt)).join(' · '),
    )
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
};

export const offeneErwaehnung = (
  text: string,
  cursor: number,
): { start: number; suche: string } | null => {
  const davor = text.slice(0, cursor);
  const treffer = /(^|[\s(])@([\p{L}\p{N}.\- ]{0,30})$/u.exec(davor);

  if (treffer === null) {
    return null;
  }

  if (treffer[2].split(' ').length > 2) {
    return null;
  }

  return {
    start: treffer.index + treffer[1].length,
    suche: treffer[2],
  };
};

export const erwaehnung = (name: string, id: string): string =>
  `@[${name.replace(/[[\]()\n]/gu, '').trim()}](nutzer:${id})`;
