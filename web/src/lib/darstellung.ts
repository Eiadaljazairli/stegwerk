import { type Darstellung } from './ansichtLink';

export type DarstellungsWahl = {
  art: Darstellung;
  gruppenFeld: string | null;
  datumFeld: string | null;
};

export const LISTE: DarstellungsWahl = {
  art: 'liste',
  gruppenFeld: null,
  datumFeld: null,
};

const schluessel = (liste: string) => `stegwerk.${liste}.darstellung`;

const FELD = /^(std|custom):[A-Za-z0-9_]{1,70}$/u;

const feldOderNull = (wert: unknown): string | null =>
  typeof wert === 'string' && FELD.test(wert) ? wert : null;

export const leseDarstellung = (
  liste: string,
  alt?: { schluessel: string },
): DarstellungsWahl => {
  try {
    const roh: unknown = JSON.parse(
      window.localStorage.getItem(schluessel(liste)) ?? 'null',
    );

    if (typeof roh === 'object' && roh !== null) {
      const o = roh as Record<string, unknown>;

      return {
        art: o.art === 'board' || o.art === 'kalender' ? o.art : 'liste',
        gruppenFeld: feldOderNull(o.gruppenFeld),
        datumFeld: feldOderNull(o.datumFeld),
      };
    }

    if (
      alt !== undefined &&
      window.localStorage.getItem(alt.schluessel) === 'board'
    ) {
      return { ...LISTE, art: 'board' };
    }
  } catch {}

  return LISTE;
};

export const merkeDarstellung = (
  liste: string,
  wahl: DarstellungsWahl,
): void => {
  try {
    window.localStorage.setItem(schluessel(liste), JSON.stringify(wahl));
  } catch {}
};

export const geltendesFeld = (
  gewaehlt: string | null,
  standard: string | null,
  moeglich: { key: string }[],
): string | null => {
  const da = (key: string | null): key is string =>
    key !== null && moeglich.some((feld) => feld.key === key);

  if (da(gewaehlt)) {
    return gewaehlt;
  }

  if (da(standard)) {
    return standard;
  }

  return moeglich[0]?.key ?? null;
};

export const feldZumSpeichern = (
  key: string,
  standard: string | null,
): string | null => (key === standard ? null : key);

export const wahlZumSpeichern = (
  wahl: DarstellungsWahl,
  felder: {
    boardFelder: { key: string }[];
    datumFelder: { key: string }[];
    geladen: boolean;
  },
): DarstellungsWahl => {
  if (!felder.geladen) {
    return wahl;
  }

  const nurMoeglich = (key: string | null, moeglich: { key: string }[]) =>
    key !== null && moeglich.some((feld) => feld.key === key) ? key : null;

  return {
    art: wahl.art,
    gruppenFeld: nurMoeglich(wahl.gruppenFeld, felder.boardFelder),
    datumFeld: nurMoeglich(wahl.datumFeld, felder.datumFelder),
  };
};
