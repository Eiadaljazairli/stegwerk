export type ZeitraumArt =
  | 'monat'
  | 'vormonat'
  | 'quartal'
  | 'jahr'
  | 'zwoelf'
  | 'frei';

export const ZEITRAUM_LABELS: Record<ZeitraumArt, string> = {
  monat: 'Dieser Monat',
  vormonat: 'Letzter Monat',
  quartal: 'Dieses Quartal',
  jahr: 'Dieses Jahr',
  zwoelf: 'Letzte 12 Monate',
  frei: 'Frei wählen',
};

const tag = (datum: Date): string =>
  `${String(datum.getFullYear())}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;

const monatsende = (jahr: number, monat: number): Date =>
  new Date(jahr, monat + 1, 0);

export const zeitraum = (
  art: Exclude<ZeitraumArt, 'frei'>,
  heute = new Date(),
): { von: string; bis: string } => {
  const jahr = heute.getFullYear();
  const monat = heute.getMonth();

  switch (art) {
    case 'monat':
      return {
        von: tag(new Date(jahr, monat, 1)),
        bis: tag(monatsende(jahr, monat)),
      };
    case 'vormonat':
      return {
        von: tag(new Date(jahr, monat - 1, 1)),
        bis: tag(monatsende(jahr, monat - 1)),
      };
    case 'quartal': {
      const erster = monat - (monat % 3);

      return {
        von: tag(new Date(jahr, erster, 1)),
        bis: tag(monatsende(jahr, erster + 2)),
      };
    }
    case 'jahr':
      return { von: `${String(jahr)}-01-01`, bis: `${String(jahr)}-12-31` };
    case 'zwoelf':
      return {
        von: tag(new Date(jahr, monat - 11, 1)),
        bis: tag(monatsende(jahr, monat)),
      };
  }
};
