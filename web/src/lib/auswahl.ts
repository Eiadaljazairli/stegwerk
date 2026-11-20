export type AuswahlTreffer = {
  id: string;
  titel: string;
  zusatz?: string | null;
};

export type AuswahlOption =
  | { art: 'treffer'; treffer: AuswahlTreffer }
  | { art: 'neu'; text: string };

export const auswahlOptionen = (
  eingabe: string,
  treffer: AuswahlTreffer[],
  ausser: readonly string[],
  neuErlaubt: boolean,
): AuswahlOption[] => {
  const text = eingabe.trim();
  const uebrig = treffer.filter((eintrag) => !ausser.includes(eintrag.id));
  const optionen: AuswahlOption[] = uebrig.map((eintrag) => ({
    art: 'treffer',
    treffer: eintrag,
  }));
  const gleich = uebrig.some(
    (eintrag) =>
      eintrag.titel.trim().toLocaleLowerCase('de-DE') ===
      text.toLocaleLowerCase('de-DE'),
  );

  if (neuErlaubt && text !== '' && !gleich) {
    optionen.push({ art: 'neu', text });
  }

  return optionen;
};

export const naechsteMarke = (
  aktuell: number,
  anzahl: number,
  richtung: 1 | -1,
): number => {
  if (anzahl === 0) {
    return -1;
  }

  if (aktuell < 0) {
    return richtung === 1 ? 0 : anzahl - 1;
  }

  return (aktuell + richtung + anzahl) % anzahl;
};

export const nameTeilen = (
  text: string,
): { firstName: string; lastName: string } | null => {
  const teile = text.trim().split(/\s+/u).filter(Boolean);

  if (teile.length < 2) {
    return null;
  }

  return {
    firstName: teile.slice(0, -1).join(' '),
    lastName: teile[teile.length - 1],
  };
};

export const kontaktTitel = (kontakt: {
  firstName: string;
  lastName: string;
}): string => `${kontakt.firstName} ${kontakt.lastName}`.trim();
