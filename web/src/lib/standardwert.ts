import { type CustomField } from './types';
import { leseZahl } from './zahl';

export const standardwertMoeglich = (
  feld: Pick<CustomField, 'type' | 'eindeutig'>,
): boolean =>
  !feld.eindeutig &&
  feld.type !== 'ADDRESS' &&
  feld.type !== 'LINKS' &&
  feld.type !== 'RELATION';

export const standardwertSenden = (
  type: CustomField['type'],
  roh: string,
): string | undefined => {
  const text = roh.trim();

  if (text === '') {
    return '';
  }

  if (type === 'NUMBER' || type === 'CURRENCY') {
    const zahl = leseZahl(text.replace(/%\s*$/u, ''));

    return zahl === undefined || zahl === null ? undefined : String(zahl);
  }

  return text;
};

export const standardwertEingabeText = (
  feld: Pick<CustomField, 'type' | 'standardwert'>,
): string => {
  const wert = feld.standardwert ?? '';

  return feld.type === 'NUMBER' || feld.type === 'CURRENCY'
    ? wert.replace('.', ',')
    : wert;
};
