import {
  ADRESS_TEILE,
  type Adresse,
  type Link,
  MAX_ADRESS_TEIL,
  MAX_LINKS,
} from './custom-field.types';

export class WertFehler extends Error {}

const PLZ_ORT = /^(\d{4,5})\s+(.+)$/u;

const teil = (text: unknown, name: string): string | undefined => {
  if (text === undefined || text === null) {
    return undefined;
  }

  if (typeof text !== 'string') {
    throw new WertFehler(`${name} muss Text sein.`);
  }

  const sauber = text.trim();

  if (sauber.length > MAX_ADRESS_TEIL) {
    throw new WertFehler(
      `${name} darf höchstens ${MAX_ADRESS_TEIL} Zeichen lang sein.`,
    );
  }

  return sauber === '' ? undefined : sauber;
};

const TEIL_NAMEN: Record<(typeof ADRESS_TEILE)[number], string> = {
  strasse: 'Die Straße',
  zusatz: 'Der Adresszusatz',
  plz: 'Die PLZ',
  ort: 'Der Ort',
  bundesland: 'Das Bundesland',
  land: 'Das Land',
};

const adresseAusText = (text: string): Adresse => {
  const teile = text
    .split(/[,\n]/u)
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag !== '');
  const mitPlz = teile.findIndex((eintrag) => PLZ_ORT.test(eintrag));

  if (mitPlz === -1) {
    const ort = teile.pop();
    const [strasse, ...zusatz] = teile;

    return {
      strasse,
      zusatz: zusatz.length > 0 ? zusatz.join(', ') : undefined,
      ort,
    };
  }

  const [, plz, ort] = PLZ_ORT.exec(teile[mitPlz]) ?? [];
  const davor = teile.slice(0, mitPlz);
  const danach = teile.slice(mitPlz + 1);

  return {
    strasse: davor[0],
    zusatz: davor.length > 1 ? davor.slice(1).join(', ') : undefined,
    plz,
    ort,
    bundesland: danach.length > 1 ? danach[0] : undefined,
    land: danach.length > 0 ? danach[danach.length - 1] : undefined,
  };
};

export const adresseLesen = (roh: unknown): Adresse | null => {
  let quelle: unknown = roh;

  if (typeof roh === 'string') {
    const text = roh.trim();

    if (text === '') {
      return null;
    }

    if (text.startsWith('{')) {
      try {
        quelle = JSON.parse(text);
      } catch {
        throw new WertFehler('Die Anschrift ließ sich nicht lesen.');
      }
    } else {
      quelle = adresseAusText(text);
    }
  }

  if (typeof quelle !== 'object' || quelle === null || Array.isArray(quelle)) {
    throw new WertFehler('Eine Anschrift besteht aus Straße, PLZ, Ort usw.');
  }

  const eingabe = quelle as Record<string, unknown>;
  const unbekannt = Object.keys(eingabe).find(
    (schluessel) => !(ADRESS_TEILE as readonly string[]).includes(schluessel),
  );

  if (unbekannt !== undefined) {
    throw new WertFehler(`„${unbekannt}“ ist kein Teil einer Anschrift.`);
  }

  const adresse: Adresse = {};

  for (const name of ADRESS_TEILE) {
    const wert = teil(eingabe[name], TEIL_NAMEN[name]);

    if (wert !== undefined) {
      adresse[name] = wert;
    }
  }

  return Object.keys(adresse).length === 0 ? null : adresse;
};

export const adresseText = (adresse: Adresse): string =>
  [
    adresse.strasse,
    adresse.zusatz,
    [adresse.plz, adresse.ort].filter(Boolean).join(' '),
    adresse.bundesland,
    adresse.land,
  ]
    .filter((eintrag) => eintrag !== undefined && eintrag !== '')
    .join(', ');

export const httpsLink = (text: string): string => {
  const roh = text.trim();
  const mitSchema = /^[a-z][a-z0-9+.-]*:/iu.test(roh) ? roh : `https://${roh}`;
  let url: URL | null;

  try {
    url = new URL(mitSchema);
  } catch {
    url = null;
  }

  if (
    url === null ||
    url.protocol !== 'https:' ||
    !url.hostname.includes('.')
  ) {
    throw new WertFehler(`„${roh}“ ist kein Link, der mit https:// beginnt.`);
  }

  if (url.toString().length > 500) {
    throw new WertFehler('Ein Link darf höchstens 500 Zeichen lang sein.');
  }

  return url.toString();
};

const linksAusText = (text: string): Link[] =>
  text
    .split(/[;\n]|\s+(?=https?:\/\/)/u)
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag !== '')
    .map((eintrag) => {
      const mitLabel = /^(\S+)\s+\((.+)\)$/u.exec(eintrag);

      return mitLabel === null
        ? { url: eintrag }
        : { url: mitLabel[1], label: mitLabel[2] };
    });

export const linksLesen = (roh: unknown): Link[] | null => {
  let quelle: unknown = roh;

  if (typeof roh === 'string') {
    const text = roh.trim();

    if (text === '') {
      return null;
    }

    if (text.startsWith('[')) {
      try {
        quelle = JSON.parse(text);
      } catch {
        throw new WertFehler('Die Links ließen sich nicht lesen.');
      }
    } else {
      quelle = linksAusText(text);
    }
  }

  if (!Array.isArray(quelle)) {
    throw new WertFehler('Links kommen als Liste.');
  }

  const links: Link[] = [];

  for (const eintrag of quelle as unknown[]) {
    const roherEintrag =
      typeof eintrag === 'string' ? { url: eintrag } : eintrag;

    if (
      typeof roherEintrag !== 'object' ||
      roherEintrag === null ||
      typeof (roherEintrag as { url?: unknown }).url !== 'string'
    ) {
      throw new WertFehler('Jeder Link braucht eine Adresse.');
    }

    const { url, label } = roherEintrag as { url: string; label?: unknown };

    if (url.trim() === '') {
      continue;
    }

    const bezeichnung =
      typeof label === 'string' && label.trim() !== ''
        ? label.trim().slice(0, 100)
        : undefined;

    links.push({
      url: httpsLink(url),
      ...(bezeichnung === undefined ? {} : { label: bezeichnung }),
    });
  }

  if (links.length > MAX_LINKS) {
    throw new WertFehler(`Höchstens ${MAX_LINKS} Links.`);
  }

  return links.length === 0 ? null : links;
};

export const linksText = (links: Link[]): string =>
  links
    .map((link) =>
      link.label === undefined ? link.url : `${link.url} (${link.label})`,
    )
    .join('; ');
