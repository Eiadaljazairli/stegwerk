export const adressListe = (roh: string): string[] => {
  const gesehen = new Set<string>();

  return roh
    .split(/[,;\n]/u)
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => {
      const schluessel = eintrag.toLowerCase();

      if (eintrag === '' || gesehen.has(schluessel)) {
        return false;
      }

      gesehen.add(schluessel);

      return true;
    });
};
