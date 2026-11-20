import { monthGrid, shiftDay, weekdayIndex } from './calendar-grid';

export const KARTEN_JE_TAG = 3;

export const kalenderZeitraum = (
  monat: string,
): { von: string; bis: string } => {
  const tage = monthGrid(monat);

  return { von: tage[0], bis: tage[tage.length - 1] };
};

export const kartenJeTag = <T>(
  karten: T[],
  datum: (karte: T) => string | null | undefined,
): Map<string, T[]> => {
  const jeTag = new Map<string, T[]>();

  for (const karte of karten) {
    const tag = datum(karte)?.slice(0, 10);

    if (tag === undefined || tag === '') {
      continue;
    }

    jeTag.set(tag, [...(jeTag.get(tag) ?? []), karte]);
  }

  return jeTag;
};

export const sichtbareKarten = <T>(
  karten: T[],
  aufgeklappt: boolean,
): { gezeigt: T[]; weitere: number } =>
  aufgeklappt || karten.length <= KARTEN_JE_TAG + 1
    ? { gezeigt: karten, weitere: 0 }
    : {
        gezeigt: karten.slice(0, KARTEN_JE_TAG),
        weitere: karten.length - KARTEN_JE_TAG,
      };

export type KalenderGetragen = {
  id: string;
  von: string;
  ziel: string;
};

export type KalenderTaste =
  | { art: 'nichts' }
  | { art: 'aufnehmen'; getragen: KalenderGetragen }
  | { art: 'ziel'; getragen: KalenderGetragen }
  | { art: 'rand'; getragen: KalenderGetragen }
  | { art: 'ablegen'; getragen: KalenderGetragen }
  | { art: 'abbrechen'; getragen: KalenderGetragen };

export const tasteImKalender = (
  taste: string,
  id: string,
  tag: string,
  getragen: KalenderGetragen | null,
  sichtbar: { von: string; bis: string },
): KalenderTaste => {
  if (getragen === null) {
    return taste === ' ' || taste === 'Enter'
      ? { art: 'aufnehmen', getragen: { id, von: tag, ziel: tag } }
      : { art: 'nichts' };
  }

  const schritt: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -weekdayIndex(getragen.ziel),
    End: 6 - weekdayIndex(getragen.ziel),
  };

  switch (taste) {
    case ' ':
    case 'Enter':
      return { art: 'ablegen', getragen };
    case 'Escape':
    case 'Tab':
      return { art: 'abbrechen', getragen };
    default: {
      const um = schritt[taste];

      if (um === undefined || um === 0) {
        return { art: 'nichts' };
      }

      const ziel = shiftDay(getragen.ziel, um);

      return ziel < sichtbar.von || ziel > sichtbar.bis
        ? { art: 'rand', getragen }
        : { art: 'ziel', getragen: { ...getragen, ziel } };
    }
  }
};

export const datumBeimAblegen = (
  feld: string,
  tag: string,
): Record<string, unknown> | null => {
  if (feld.startsWith('custom:')) {
    return { customFields: { [feld.slice('custom:'.length)]: tag } };
  }

  switch (feld) {
    case 'std:closeDate':
      return { closeDate: tag };
    case 'std:dueDate':
      return { dueDate: tag };
    default:
      return null;
  }
};

export const tagVorgelesen = (tag: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${tag}T00:00:00Z`));

export const kalenderAnsage = (
  ergebnis: KalenderTaste,
  name: string,
): string | null => {
  switch (ergebnis.art) {
    case 'nichts':
      return null;
    case 'aufnehmen':
      return `„${name}“ aufgenommen, ${tagVorgelesen(ergebnis.getragen.von)}. Mit den Pfeiltasten einen Tag oder eine Woche weiter, mit Leertaste ablegen, mit Escape abbrechen.`;
    case 'ziel':
      return tagVorgelesen(ergebnis.getragen.ziel);
    case 'rand':
      return 'Weiter geht es in diesem Monat nicht. Legen Sie die Karte ab und blättern Sie weiter.';
    case 'ablegen':
      return ergebnis.getragen.ziel === ergebnis.getragen.von
        ? `„${name}“ bleibt am ${tagVorgelesen(ergebnis.getragen.von)}.`
        : `„${name}“ auf ${tagVorgelesen(ergebnis.getragen.ziel)} gelegt.`;
    case 'abbrechen':
      return `Verschieben abgebrochen. „${name}“ bleibt am ${tagVorgelesen(ergebnis.getragen.von)}.`;
  }
};
