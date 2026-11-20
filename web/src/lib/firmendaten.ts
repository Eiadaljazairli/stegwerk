export type ImpressumFeld = {
  feld: string;
  label: string;
  wert: string;
  aktuell: string | null;
  uebernehmbar: boolean;
  grund: string | null;
};

export type ImpressumVorschau = {
  quelle: string;
  felder: ImpressumFeld[];
};

export const vorauswahl = (felder: ImpressumFeld[]): Set<string> =>
  new Set(felder.filter((feld) => feld.uebernehmbar).map((feld) => feld.feld));

export const umschalten = (auswahl: Set<string>, feld: string): Set<string> => {
  const neu = new Set(auswahl);

  if (neu.has(feld)) {
    neu.delete(feld);
  } else {
    neu.add(feld);
  }

  return neu;
};

export const uebernahmeWerte = (
  felder: ImpressumFeld[],
  auswahl: Set<string>,
): { feld: string; wert: string }[] =>
  felder
    .filter((feld) => feld.uebernehmbar && auswahl.has(feld.feld))
    .map(({ feld, wert }) => ({ feld, wert }));

export const hostVon = (adresse: string | null | undefined): string | null => {
  if (adresse == null || adresse.trim() === '') {
    return null;
  }

  try {
    return new URL(adresse).hostname;
  } catch {
    return null;
  }
};

export const leseQuelle = (
  website: string | null | undefined,
  domain: string | null | undefined,
): string | null => {
  const host = hostVon(website);

  if (host !== null) {
    return host;
  }

  const ohne = (domain ?? '').trim();

  return ohne === '' ? null : ohne;
};
