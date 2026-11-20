const WURZEL = /^(ausloeser|schritt[1-5])$/u;

const MUSTER =
  /\{\{\s*(ausloeser|schritt[1-5])((?:\.[A-Za-z0-9_]{1,60}){0,6})\s*\}\}/gu;

export const MAX_WERT = 2000;

export const MAX_FELD = 10_000;

export type Variablen = Record<string, unknown>;

const istEinfachesObjekt = (wert: unknown): wert is Record<string, unknown> =>
  wert !== null &&
  typeof wert === 'object' &&
  !Array.isArray(wert) &&
  Object.getPrototypeOf(wert) === Object.prototype;

export const nachschlagen = (
  variablen: Variablen,
  wurzel: string,
  pfad: string[],
): unknown => {
  if (!WURZEL.test(wurzel) || !Object.hasOwn(variablen, wurzel)) {
    return undefined;
  }

  let wert: unknown = variablen[wurzel];

  for (const teil of pfad) {
    if (Array.isArray(wert)) {
      if (!/^\d{1,3}$/u.test(teil)) {
        return undefined;
      }

      wert = wert[Number(teil)];
    } else if (istEinfachesObjekt(wert)) {
      if (!Object.hasOwn(wert, teil)) {
        return undefined;
      }

      wert = wert[teil];
    } else {
      return undefined;
    }
  }

  return wert;
};

export const alsText = (wert: unknown): string => {
  if (wert === undefined || wert === null) {
    return '';
  }

  const text =
    typeof wert === 'string'
      ? wert
      : typeof wert === 'number' || typeof wert === 'boolean'
        ? String(wert)
        : wert instanceof Date
          ? wert.toISOString()
          : JSON.stringify(wert);

  return text.slice(0, MAX_WERT);
};

export const setzeEin = (text: string, variablen: Variablen): string =>
  text
    .replace(MUSTER, (_ganz, wurzel: string, pfad: string) =>
      alsText(
        nachschlagen(
          variablen,
          wurzel,
          pfad === '' ? [] : pfad.slice(1).split('.'),
        ),
      ),
    )
    .slice(0, MAX_FELD);

export const genannteVariablen = (text: string): string[] =>
  [...text.matchAll(MUSTER)].map((treffer) => `${treffer[1]}${treffer[2]}`);
