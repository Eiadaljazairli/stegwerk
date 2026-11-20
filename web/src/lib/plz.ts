export type PlzOrt = { ort: string; bundesland: string | null };

export const plzVollstaendig = (plz: string | null | undefined): boolean =>
  /^\d{5}$/.test((plz ?? '').trim());

export const meintDeutschland = (land: string | null | undefined): boolean =>
  ['', 'de', 'deu', 'deutschland', 'germany'].includes(
    (land ?? '').trim().toLowerCase(),
  );

export const ortErgaenzen = (
  adresse: { ort?: string | null; bundesland?: string | null },
  orte: PlzOrt[],
): { ort?: string; bundesland?: string } | null => {
  if (orte.length !== 1) {
    return null;
  }

  const [treffer] = orte;
  const ergaenzung: { ort?: string; bundesland?: string } = {};

  if ((adresse.ort ?? '').trim() === '') {
    ergaenzung.ort = treffer.ort;
  }

  if (
    ergaenzung.ort !== undefined &&
    adresse.bundesland !== undefined &&
    (adresse.bundesland ?? '').trim() === '' &&
    treffer.bundesland !== null
  ) {
    ergaenzung.bundesland = treffer.bundesland;
  }

  return Object.keys(ergaenzung).length === 0 ? null : ergaenzung;
};
