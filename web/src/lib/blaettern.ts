const SCHLUESSEL = (art: string) => `stegwerk:blaettern:${art}`;

export const merkeReihenfolge = (art: string, ids: string[]): void => {
  try {
    window.sessionStorage.setItem(SCHLUESSEL(art), JSON.stringify(ids));
  } catch {}
};

export type Nachbarn = {
  vorher: string | null;
  nachher: string | null;
  position: number;
  anzahl: number;
};

export const nachbarnVon = (art: string, id: string): Nachbarn | null => {
  let ids: unknown;

  try {
    ids = JSON.parse(window.sessionStorage.getItem(SCHLUESSEL(art)) ?? 'null');
  } catch {
    return null;
  }

  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
    return null;
  }

  const liste = ids as string[];
  const index = liste.indexOf(id);

  if (index === -1 || liste.length < 2) {
    return null;
  }

  return {
    vorher: index > 0 ? liste[index - 1] : null,
    nachher: index < liste.length - 1 ? liste[index + 1] : null,
    position: index + 1,
    anzahl: liste.length,
  };
};
