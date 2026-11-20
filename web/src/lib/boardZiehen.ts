export type BoardSpalte = {
  stage: string;
  label: string;
  nimmtAn: boolean;
  karten: string[];
};

export type Getragen = {
  dealId: string;
  von: string;
  ziel: string;
};

export type TastenErgebnis =
  | { art: 'nichts' }
  | { art: 'fokus'; dealId: string }
  | { art: 'aufnehmen'; getragen: Getragen }
  | { art: 'ziel'; getragen: Getragen }
  | { art: 'ablegen'; getragen: Getragen }
  | { art: 'abbrechen'; getragen: Getragen };

const NICHTS: TastenErgebnis = { art: 'nichts' };

const spalteVon = (spalten: BoardSpalte[], dealId: string): number =>
  spalten.findIndex((spalte) => spalte.karten.includes(dealId));

const ziele = (spalten: BoardSpalte[], von: string): BoardSpalte[] =>
  spalten.filter((spalte) => spalte.nimmtAn || spalte.stage === von);

const ohneGetragen = (
  taste: string,
  spalten: BoardSpalte[],
  dealId: string,
): TastenErgebnis => {
  const s = spalteVon(spalten, dealId);

  if (s === -1) {
    return NICHTS;
  }

  const spalte = spalten[s];
  const position = spalte.karten.indexOf(dealId);

  switch (taste) {
    case ' ':
    case 'Enter':
      return {
        art: 'aufnehmen',
        getragen: { dealId, von: spalte.stage, ziel: spalte.stage },
      };
    case 'ArrowUp':
    case 'ArrowDown': {
      const neu = position + (taste === 'ArrowUp' ? -1 : 1);

      return neu < 0 || neu >= spalte.karten.length
        ? NICHTS
        : { art: 'fokus', dealId: spalte.karten[neu] };
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const schritt = taste === 'ArrowLeft' ? -1 : 1;

      for (let i = s + schritt; i >= 0 && i < spalten.length; i += schritt) {
        const karten = spalten[i].karten;

        if (karten.length > 0) {
          return {
            art: 'fokus',
            dealId: karten[Math.min(position, karten.length - 1)],
          };
        }
      }

      return NICHTS;
    }
    default:
      return NICHTS;
  }
};

const mitGetragen = (
  taste: string,
  spalten: BoardSpalte[],
  getragen: Getragen,
): TastenErgebnis => {
  const moeglich = ziele(spalten, getragen.von);
  const jetzt = moeglich.findIndex((spalte) => spalte.stage === getragen.ziel);
  const nach = (index: number): TastenErgebnis =>
    index < 0 || index >= moeglich.length || index === jetzt
      ? NICHTS
      : {
          art: 'ziel',
          getragen: { ...getragen, ziel: moeglich[index].stage },
        };

  switch (taste) {
    case ' ':
    case 'Enter':
      return { art: 'ablegen', getragen };
    case 'Escape':
    case 'Tab':
      return { art: 'abbrechen', getragen };
    case 'ArrowLeft':
      return nach(jetzt - 1);
    case 'ArrowRight':
      return nach(jetzt + 1);
    case 'Home':
      return nach(0);
    case 'End':
      return nach(moeglich.length - 1);
    default:
      return NICHTS;
  }
};

export const tasteImBoard = (
  taste: string,
  spalten: BoardSpalte[],
  dealId: string,
  getragen: Getragen | null,
): TastenErgebnis =>
  getragen === null
    ? ohneGetragen(taste, spalten, dealId)
    : mitGetragen(taste, spalten, getragen);

export const ansage = (
  ergebnis: TastenErgebnis,
  spalten: BoardSpalte[],
  name: string,
  wort = 'Phase',
): string | null => {
  if (ergebnis.art === 'nichts' || ergebnis.art === 'fokus') {
    return null;
  }

  const { von, ziel } = ergebnis.getragen;
  const label = (stage: string) =>
    spalten.find((spalte) => spalte.stage === stage)?.label ?? stage;

  switch (ergebnis.art) {
    case 'aufnehmen':
      return `„${name}“ aufgenommen, ${wort} ${label(von)}. Mit Pfeil links und rechts ${wort === 'Phase' ? 'die Phase' : 'die Spalte'} wählen, mit Leertaste ablegen, mit Escape abbrechen.`;
    case 'ziel': {
      const moeglich = ziele(spalten, von);
      const index = moeglich.findIndex((spalte) => spalte.stage === ziel);

      return `${label(ziel)}, ${wort} ${String(index + 1)} von ${String(moeglich.length)}.`;
    }
    case 'ablegen':
      return ziel === von
        ? `„${name}“ bleibt in ${label(von)}.`
        : `„${name}“ nach ${label(ziel)} verschoben.`;
    case 'abbrechen':
      return `Verschieben abgebrochen. „${name}“ bleibt in ${label(von)}.`;
  }
};

export type Aktivierung =
  | { art: 'halten'; ms: number; toleranz: number }
  | { art: 'abstand'; px: number };

export const aktivierungFuer = (pointerType: string): Aktivierung =>
  pointerType === 'touch'
    ? { art: 'halten', ms: 250, toleranz: 5 }
    : { art: 'abstand', px: 8 };
