import { leseZahl } from './zahl';

export type EingabeTyp = 'text' | 'email' | 'number' | 'date' | 'select';

export const wertAusEingabe = (
  typ: EingabeTyp,
  roh: string,
): string | number | null | undefined => {
  const getrimmt = roh.trim();

  if (getrimmt === '') {
    return null;
  }

  if (typ === 'number') {
    return leseZahl(getrimmt) ?? undefined;
  }

  return getrimmt;
};

export const alsEingabe = (
  typ: EingabeTyp,
  wert: string | number | null | undefined,
): string => {
  if (wert === null || wert === undefined) {
    return '';
  }

  if (typ === 'number' && typeof wert === 'number') {
    return String(wert).replace('.', ',');
  }

  return typ === 'date' ? String(wert).slice(0, 10) : String(wert);
};

export type Pruefung =
  | { art: 'unveraendert' }
  | { art: 'unlesbar' }
  | { art: 'speichern'; wert: string | number | null };

export const pruefeEntwurf = (
  typ: EingabeTyp,
  entwurf: string,
  ausgang: string | number | null | undefined,
): Pruefung => {
  if (entwurf.trim() === alsEingabe(typ, ausgang).trim()) {
    return { art: 'unveraendert' };
  }

  const wert = wertAusEingabe(typ, entwurf);

  if (wert === undefined) {
    return { art: 'unlesbar' };
  }

  if (typ === 'number' && typeof ausgang === 'number' && wert === ausgang) {
    return { art: 'unveraendert' };
  }

  return { art: 'speichern', wert };
};

export const blaettertAuswahl = (event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean => {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return (
    [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ].includes(event.key) ||
    (event.key.length === 1 && event.key !== ' ')
  );
};
