export type Platzhalter = {
  vorname?: string | null;
  nachname?: string | null;
  firma?: string | null;
  mein_vorname?: string | null;
  mein_name?: string | null;
};

export const PLATZHALTER: { key: keyof Platzhalter; beschreibung: string }[] = [
  { key: 'vorname', beschreibung: 'Vorname des Kontakts' },
  { key: 'nachname', beschreibung: 'Nachname des Kontakts' },
  { key: 'firma', beschreibung: 'Firma' },
  { key: 'mein_vorname', beschreibung: 'Ihr Vorname' },
  { key: 'mein_name', beschreibung: 'Ihr ganzer Name' },
];

export const PLATZHALTER_MUSTER =
  /\{\{\s*([a-z_]+)\s*(?:\|([^{}|]{0,80}))?\}\}/gu;

export const fuelleVorlage = (text: string, werte: Platzhalter): string =>
  text
    .replace(PLATZHALTER_MUSTER, (_ganz, key: string, ersatz?: string) => {
      const wert = werte[key as keyof Platzhalter];

      return typeof wert === 'string' && wert.trim() !== ''
        ? wert.trim()
        : (ersatz?.trim() ?? '');
    })
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/ +([,.!?])/gu, '$1');

export const signaturBlock = (signatur: string | null | undefined): string =>
  signatur == null || signatur.trim() === ''
    ? ''
    : `\n\n-- \n${signatur.trim()}`;

export const vorlageEinsetzen = (
  rumpf: string,
  text: string,
  signatur: string,
): string => {
  if (signatur !== '' && rumpf.endsWith(signatur)) {
    const davor = rumpf.slice(0, -signatur.length);

    return `${davor.trim() === '' ? text : `${davor}\n\n${text}`}${signatur}`;
  }

  return rumpf.trim() === '' ? text : `${rumpf}\n\n${text}`;
};
