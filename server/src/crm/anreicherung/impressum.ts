import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { decodeText } from '../../mailboxes/message-shape';

export type ImpressumDaten = {
  name?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  registergericht?: string;
  registernummer?: string;
  ustIdNr?: string;
  vertretung?: string;
};

const TEXT_MAX = 200_000;

const ENTITAETEN: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  euro: '€',
  eacute: 'é',
  egrave: 'è',
  middot: '·',
  ndash: '–',
  mdash: '—',
  sect: '§',
  copy: '©',
  reg: '®',
  bull: '•',
  shy: '',
  zwnj: '',
  commat: '@',
  period: '.',
  lpar: '(',
  rpar: ')',
};

const zeichen = (code: number): string => {
  try {
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  } catch {
    return ' ';
  }
};

export const entitaetenLoesen = (text: string): string =>
  text
    .replace(/&#(\d{1,7});/gu, (_, code: string) => zeichen(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/giu, (_, code: string) =>
      zeichen(Number.parseInt(code, 16)),
    )
    .replace(
      /&([a-z]{2,8});/giu,
      (ganz, name: string) => ENTITAETEN[name] ?? ganz,
    );

const ohneBloecke = (html: string): string => {
  const klein = html.toLowerCase();
  const paare: [string, string][] = [
    ['<!--', '-->'],
    ['<script', '</script'],
    ['<style', '</style'],
    ['<noscript', '</noscript'],
    ['<svg', '</svg'],
    ['<template', '</template'],
    ['<head', '</head'],
  ];
  const teile: string[] = [];
  let pos = 0;
  const fundstellen: number[] = paare.map(() => -2);

  const naechsteFundstelle = (index: number): number => {
    const [auf] = paare[index];
    let anfang = fundstellen[index];

    if (anfang === -1 || anfang >= pos) {
      return anfang;
    }

    anfang = klein.indexOf(auf, pos);

    while (
      anfang !== -1 &&
      auf !== '<!--' &&
      /[a-z0-9-]/u.test(klein[anfang + auf.length] ?? '')
    ) {
      anfang = klein.indexOf(auf, anfang + 1);
    }

    fundstellen[index] = anfang;

    return anfang;
  };

  for (;;) {
    let naechster: { anfang: number; ende: string } | null = null;

    for (let index = 0; index < paare.length; index += 1) {
      const anfang = naechsteFundstelle(index);

      if (anfang !== -1 && (naechster === null || anfang < naechster.anfang)) {
        naechster = { anfang, ende: paare[index][1] };
      }
    }

    if (naechster === null) {
      teile.push(html.slice(pos));
      break;
    }

    teile.push(html.slice(pos, naechster.anfang), ' ');

    const ende = klein.indexOf(naechster.ende, naechster.anfang);

    if (ende === -1) {
      break;
    }

    const schluss = klein.indexOf('>', ende);

    pos = schluss === -1 ? html.length : schluss + 1;
  }

  return teile.join('');
};

export const htmlZuText = (html: string): string =>
  entitaetenLoesen(
    ohneBloecke(html.slice(0, TEXT_MAX * 5))
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(
        /<\/?(?:p|div|tr|td|th|li|ul|ol|dd|dt|dl|h[1-6]|address|section|article|footer|header|main|nav|table|tbody)\b[^<>]*>/giu,
        '\n',
      )
      .replace(/<[^<>]*>/gu, ' '),
  )
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/[^\S\n]+/gu, ' ')
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== '')
    .join('\n')
    .slice(0, TEXT_MAX);

export const htmlDekodieren = (bytes: Buffer, typ: string | null): string => {
  const ausKopf = /charset=["']?([\w-]{1,40})/iu.exec(typ ?? '')?.[1];
  const anfang = bytes.subarray(0, 4096).toString('latin1');
  const ausSeite = /<meta[^<>]{0,200}?charset=["']?([\w-]{1,40})/iu.exec(
    anfang,
  )?.[1];

  return decodeText(bytes, ausKopf ?? ausSeite ?? 'utf-8');
};

type Verweis = { href: string; text: string };

export const verweise = (html: string): Verweis[] => {
  const ergebnis: Verweis[] = [];
  const klein = html.toLowerCase();
  const oeffnend = /<a\b([^<>]{0,2000})>/giu;
  let treffer: RegExpExecArray | null;

  while ((treffer = oeffnend.exec(html)) !== null && ergebnis.length < 2000) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/iu.exec(
      treffer[1],
    );
    const titel = /\b(?:title|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(
      treffer[1],
    );
    const wert = href?.[1] ?? href?.[2] ?? href?.[3];
    const innenAb = treffer.index + treffer[0].length;
    const ende = klein.slice(innenAb, innenAb + 2003).indexOf('</a');
    const innen = ende === -1 ? '' : html.slice(innenAb, innenAb + ende);

    if (wert !== undefined) {
      ergebnis.push({
        href: entitaetenLoesen(wert.trim()),
        text: `${htmlZuText(innen)} ${titel?.[1] ?? titel?.[2] ?? ''}`.trim(),
      });
    }
  }

  return ergebnis;
};

const IMPRESSUM_TEXT = /\b(impressum|imprint|anbieterkennzeichnung)\b/iu;
const IMPRESSUM_PFAD =
  /(impressum|imprint|anbieterkennzeichnung|legal-notice|legal_notice)/iu;
const RECHTLICHES = /\b(legal|rechtliches|rechtliche hinweise)\b/iu;

export const impressumLink = (html: string, basis: URL): URL | null => {
  let bester: { url: URL; punkte: number } | null = null;

  for (const verweis of verweise(html)) {
    if (/^(mailto|tel|javascript|data):/iu.test(verweis.href)) {
      continue;
    }

    let url: URL;

    try {
      url = new URL(verweis.href, basis);
    } catch {
      continue;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      continue;
    }

    let punkte = 0;

    if (IMPRESSUM_TEXT.test(verweis.text)) {
      punkte += 10;
    }

    if (IMPRESSUM_PFAD.test(url.pathname)) {
      punkte += 8;
    }

    if (punkte === 0 && RECHTLICHES.test(`${verweis.text} ${url.pathname}`)) {
      punkte += 3;
    }

    if (punkte === 0) {
      continue;
    }

    if (
      url.hostname.replace(/^www\./u, '') ===
      basis.hostname.replace(/^www\./u, '')
    ) {
      punkte += 2;
    }

    url.hash = '';

    if (bester === null || punkte > bester.punkte) {
      bester = { url, punkte };
    }
  }

  return bester?.url ?? null;
};

const PLZ_ORT = /(?:^|\n|,\s?)(?:D[-–]\s?)?(\d{5})\s+([A-ZÄÖÜ][^\n,;|]{1,60})/u;

const impressumAnfang = (text: string): number => {
  const anker =
    /angaben gem(?:ä|ae)(?:ß|ss)|§\s?5\s?(?:tmg|ddg)|anbieterkennzeichnung|impressum|imprint/giu;
  let treffer: RegExpExecArray | null;

  while ((treffer = anker.exec(text)) !== null) {
    if (PLZ_ORT.test(text.slice(treffer.index, treffer.index + 800))) {
      return treffer.index;
    }
  }

  return 0;
};

const RECHTSFORM =
  /\b(GmbH|gGmbH|mbH|AG|SE|KG|KGaA|OHG|GbR|PartG|UG|e\.\s?K\.|e\.\s?Kfm\.|e\.\s?V\.|eG|Ltd\.?|Inc\.?|S\.A\.|B\.V\.)(?=$|[\s,.)&])/u;

const STRASSE =
  /^([A-ZÄÖÜa-zäöüß][\p{L}.'\- ]{1,60}?\s?\d{1,4}\s?[a-zA-Z]?(?:\s?[-–/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/u;

const LAENDER: Record<string, string> = {
  deutschland: 'Deutschland',
  germany: 'Deutschland',
  österreich: 'Österreich',
  austria: 'Österreich',
  schweiz: 'Schweiz',
  switzerland: 'Schweiz',
};

const sauber = (wert: string, max: number): string =>
  wert
    .replace(/\s+/gu, ' ')
    .replace(/^[\s:,;\-–|]+|[\s,;\-–|]+$/gu, '')
    .slice(0, max)
    .trim();

const anschriftZeilen = (zeilen: string[]): string[] =>
  zeilen.flatMap((zeile) =>
    /[·|•,;]\s?(?:D[-–]\s?)?\d{5}\s/u.test(zeile)
      ? zeile
          .split(/\s?[·|•;]\s?|,\s?/u)
          .map((teil) => teil.trim())
          .filter((teil) => teil !== '')
      : [zeile],
  );

const anschrift = (roh: string[]): Partial<ImpressumDaten> => {
  const zeilen = anschriftZeilen(roh.slice(0, 80));

  for (let i = 0; i < zeilen.length; i += 1) {
    const ort = /^(?:D[-–]\s?)?(\d{5})\s+([A-ZÄÖÜ][^\n,;|]{1,60})$/u.exec(
      zeilen[i],
    );

    if (ort === null) {
      continue;
    }

    const ergebnis: Partial<ImpressumDaten> = {
      postalCode: ort[1],
      city: sauber(ort[2], 120),
    };
    let nameAb = i - 1;
    const davor = zeilen[i - 1] ?? '';

    if (STRASSE.test(davor) || /^postfach\s+\d/iu.test(davor)) {
      ergebnis.street = sauber(davor, 200);
      nameAb = i - 2;
    }

    for (let j = nameAb; j >= 0 && j >= nameAb - 3; j -= 1) {
      if (RECHTSFORM.test(zeilen[j]) && zeilen[j].length <= 200) {
        ergebnis.name = sauber(zeilen[j], 200);
        break;
      }
    }

    const danach = (zeilen[i + 1] ?? '').toLowerCase().trim();

    if (LAENDER[danach] !== undefined) {
      ergebnis.country = LAENDER[danach];
    }

    return ergebnis;
  }

  return {};
};

const TELEFON =
  /(?:^|\n|\s|\|)(?:telefon|tel\.?|fon|phone|telephone|t)\s?[:.]?\s{0,3}((?:\+|00|0|\(0)[\d\s()/.\-–]{5,24}\d)/iu;

export const telefonLesen = (text: string): string | undefined => {
  for (const zeile of text.split('\n')) {
    const ohneFax = zeile.split(/\b(?:fax|telefax)\b/iu)[0];
    const treffer = TELEFON.exec(ohneFax);

    if (treffer === null) {
      continue;
    }

    const roh = treffer[1].replace(/\s+/gu, ' ').trim();
    const nummer = parsePhoneNumberFromString(roh, 'DE');

    return nummer?.isValid() === true ? nummer.number : sauber(roh, 50);
  }

  return undefined;
};

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}/u;

const entschleiern = (text: string): string =>
  text
    .replace(/\s?[[({]\s?(?:at|ät|@)\s?[\])}]\s?/giu, '@')
    .replace(/\s?[[({]\s?(?:dot|punkt|\.)\s?[\])}]\s?/giu, '.');

export const emailLesen = (text: string, html = ''): string | undefined => {
  const mailto = /mailto:([^"'?\s>]{3,254})/iu.exec(html);

  if (mailto !== null) {
    const adresse = decodeURIComponent(
      mailto[1].replace(/%(?![0-9a-f]{2})/giu, '%25'),
    );

    if (EMAIL.test(adresse)) {
      return EMAIL.exec(adresse)?.[0].toLowerCase();
    }
  }

  return EMAIL.exec(entschleiern(text))?.[0].toLowerCase();
};

const REGISTER =
  /\b(HRB|HRA|GnR|PR|VR|GsR)\s?(?:-?\s?Nr\.?)?\s?[:.]?\s?(\d{1,7}(?:\s?[A-Z]{1,3}\b)?)/u;
const GERICHT =
  /(Amtsgericht|Registergericht|AG)\s?[:.]?\s?(?:Amtsgericht\s)?([A-ZÄÖÜ][\p{L}.\- ]{1,40}?(?:\s(?:am|an der|im|in der|\(Oder\)|\(Main\))\s?[\p{L}.()\- ]{0,20}?)?)(?=\s*(?:$|[,;|\n(]|HR[AB]|unter|Register|Handels|\d))/mu;

export const registerLesen = (
  text: string,
): Pick<ImpressumDaten, 'registergericht' | 'registernummer'> => {
  const nummer = REGISTER.exec(text);
  const ergebnis: Pick<ImpressumDaten, 'registergericht' | 'registernummer'> =
    {};

  if (nummer === null) {
    return ergebnis;
  }

  ergebnis.registernummer = sauber(`${nummer[1]} ${nummer[2]}`, 40);

  const umfeld = text.slice(
    Math.max(0, nummer.index - 300),
    nummer.index + 300,
  );
  const gericht = GERICHT.exec(umfeld);

  if (gericht !== null) {
    const ort = sauber(gericht[2], 100).replace(/\s(?:HR[AB]|unter)$/u, '');

    if (ort !== '' && !/^(Nr|Nummer|HR[AB])$/iu.test(ort)) {
      ergebnis.registergericht = `Amtsgericht ${ort}`;
    }
  }

  return ergebnis;
};

export const ustIdLesen = (text: string): string | undefined => {
  const de = /\bDE\s?(\d{3})\s?(\d{3})\s?(\d{3})\b/u.exec(text);

  if (de !== null) {
    return `DE${de[1]}${de[2]}${de[3]}`;
  }

  const at = /\bATU\s?(\d{8})\b/u.exec(text);

  return at === null ? undefined : `ATU${at[1]}`;
};

const VERTRETUNG =
  /(?:^|\n|[·|•])\s?(?:vertreten durch(?: die| den)?(?: geschäftsführer(?:in)?| geschäftsführung| vorstand)?|vertretungsberechtigte?r?(?: geschäftsführer(?:in)?)?|geschäftsführer(?:in|innen)?|geschäftsführung|geschäftsführende gesellschafter(?:in)?|vorstand|inhaber(?:in)?)\s?(?:\(.{0,30}?\))?\s?[:]?\s?([^\n]{0,300})(?:\n([^\n]{0,200}))?/iu;

export const vertretungLesen = (text: string): string | undefined => {
  const treffer = VERTRETUNG.exec(text);

  if (treffer === null) {
    return undefined;
  }

  let wert = treffer[1].trim() === '' ? (treffer[2] ?? '') : treffer[1];

  wert = wert
    .split(/\s[·|•]\s/u)[0]
    .split(
      /\b(?:registergericht|handelsregister|amtsgericht|registernummer|hr[ab]\b|ust|umsatzsteuer|steuernummer|telefon|tel\.|e-mail|sitz)\b/iu,
    )[0]
    .replace(/^(?:die|der|den)\s/iu, '');

  const ergebnis = sauber(wert, 300);

  return ergebnis.length >= 3 && /\p{L}/u.test(ergebnis) ? ergebnis : undefined;
};

export const impressumLesen = (html: string): ImpressumDaten => {
  const ganz = htmlZuText(html);
  const text = ganz.slice(impressumAnfang(ganz));
  const kopf = text.slice(0, 4000);
  const daten: ImpressumDaten = {
    ...anschrift(kopf.split('\n')),
    phone: telefonLesen(kopf),
    email: emailLesen(kopf, html),
    ...registerLesen(text.slice(0, 8000)),
    ustIdNr: ustIdLesen(text.slice(0, 8000)),
    vertretung: vertretungLesen(text.slice(0, 6000)),
  };

  return Object.fromEntries(
    Object.entries(daten).filter(
      ([, wert]) => typeof wert === 'string' && wert !== '',
    ),
  ) as ImpressumDaten;
};
