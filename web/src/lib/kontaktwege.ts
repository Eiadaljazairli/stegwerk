export type Kontaktweg = {
  art: string;
  wert: string;
  unzustellbarSeit?: string | null;
};

export const EMAIL_ARTEN: { wert: string; label: string }[] = [
  { wert: 'arbeit', label: 'Arbeit' },
  { wert: 'privat', label: 'Privat' },
  { wert: 'sonstige', label: 'Sonstige' },
];

export const TELEFON_ARTEN: { wert: string; label: string }[] = [
  { wert: 'mobil', label: 'Mobil' },
  { wert: 'festnetz', label: 'Festnetz' },
  { wert: 'arbeit', label: 'Arbeit' },
  { wert: 'privat', label: 'Privat' },
  { wert: 'fax', label: 'Fax' },
  { wert: 'sonstige', label: 'Sonstige' },
];

export const artLabel = (art: string): string =>
  [...EMAIL_ARTEN, ...TELEFON_ARTEN].find((eintrag) => eintrag.wert === art)
    ?.label ?? art;

export const alsEingabe = (liste: Kontaktweg[]) =>
  liste.map(({ art, wert }) => ({ art, wert }));
