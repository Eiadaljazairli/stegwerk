const FRUEHERE_PRAEFIXE = ['weitblick.', 'canla.'];

const AKTUELL = 'stegwerk.';

const ERLEDIGT = `${AKTUELL}umzug.1`;

export const holeAltenSpeicher = (): void => {
  let speicher: Storage;

  try {
    speicher = window.localStorage;

    if (speicher.getItem(ERLEDIGT) !== null) {
      return;
    }
  } catch {
    return;
  }

  try {
    const umzuhaengen: { alt: string; neu: string }[] = [];

    for (let i = 0; i < speicher.length; i += 1) {
      const schluessel = speicher.key(i);

      if (schluessel === null) {
        continue;
      }

      const praefix = FRUEHERE_PRAEFIXE.find((p) => schluessel.startsWith(p));

      if (praefix === undefined) {
        continue;
      }

      const neu = `${AKTUELL}${schluessel.slice(praefix.length)}`;

      if (speicher.getItem(neu) === null) {
        umzuhaengen.push({ alt: schluessel, neu });
      }
    }

    for (const { alt, neu } of umzuhaengen) {
      const wert = speicher.getItem(alt);

      if (wert !== null) {
        speicher.setItem(neu, wert);
      }
    }

    speicher.setItem(ERLEDIGT, new Date().toISOString());
  } catch {}
};
