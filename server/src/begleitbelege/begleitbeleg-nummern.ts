import { ART_TEXT, type BegleitbelegArt } from './begleitbeleg.types';

const STELLEN = 4;

export const formatBelegNummer = (
  art: BegleitbelegArt,
  jahr: number,
  laufend: number,
): string => {
  if (!Number.isInteger(jahr) || jahr < 1000 || jahr > 9999) {
    throw new Error(`Kein gültiges Jahr für eine Belegnummer: ${String(jahr)}`);
  }

  if (!Number.isInteger(laufend) || laufend < 1) {
    throw new Error(
      `Keine gültige laufende Zahl für eine Belegnummer: ${String(laufend)}`,
    );
  }

  return `${ART_TEXT[art].kuerzel}-${String(jahr)}-${String(laufend).padStart(STELLEN, '0')}`;
};
