export type Zelle = { zeile: number; spalte: number };

const SEITE = 10;

export const naechsteZelle = (
  von: Zelle,
  taste: string,
  groesse: { zeilen: number; spalten: number },
  strg = false,
): Zelle | null => {
  if (groesse.zeilen === 0 || groesse.spalten === 0) {
    return null;
  }

  const letzteZeile = groesse.zeilen - 1;
  const letzteSpalte = groesse.spalten - 1;
  const begrenzt = (zeile: number, spalte: number): Zelle => ({
    zeile: Math.min(Math.max(zeile, 0), letzteZeile),
    spalte: Math.min(Math.max(spalte, 0), letzteSpalte),
  });

  switch (taste) {
    case 'ArrowUp':
      return begrenzt(von.zeile - 1, von.spalte);
    case 'ArrowDown':
      return begrenzt(von.zeile + 1, von.spalte);
    case 'ArrowLeft':
      return begrenzt(von.zeile, von.spalte - 1);
    case 'ArrowRight':
      return begrenzt(von.zeile, von.spalte + 1);
    case 'Home':
      return strg ? begrenzt(0, 0) : begrenzt(von.zeile, 0);
    case 'End':
      return strg
        ? begrenzt(letzteZeile, letzteSpalte)
        : begrenzt(von.zeile, letzteSpalte);
    case 'PageUp':
      return begrenzt(von.zeile - SEITE, von.spalte);
    case 'PageDown':
      return begrenzt(von.zeile + SEITE, von.spalte);
    default:
      return null;
  }
};

export const innerhalb = (
  zelle: Zelle,
  groesse: { zeilen: number; spalten: number },
): Zelle => ({
  zeile: Math.max(0, Math.min(zelle.zeile, groesse.zeilen - 1)),
  spalte: Math.max(0, Math.min(zelle.spalte, groesse.spalten - 1)),
});

export const zellenSchluessel = (zelle: Zelle): string =>
  `${String(zelle.zeile)}:${String(zelle.spalte)}`;

export const ausSchluessel = (schluessel: string | undefined): Zelle | null => {
  const treffer = /^(\d+):(\d+)$/u.exec(schluessel ?? '');

  return treffer === null
    ? null
    : { zeile: Number(treffer[1]), spalte: Number(treffer[2]) };
};

export const FOKUSSIERBAR =
  'a[href], button, input, select, textarea, [tabindex]:not(td)';
