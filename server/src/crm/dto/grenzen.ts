import { Matches, Max, Min } from 'class-validator';

export const HOECHSTBETRAG = 999_999_999_999.99;

export const Betrag =
  (feld: string): PropertyDecorator =>
  (ziel, schluessel) => {
    Min(0, { message: `${feld} darf nicht negativ sein.` })(ziel, schluessel);
    Max(HOECHSTBETRAG, {
      message: `${feld} darf höchstens 999.999.999.999,99 betragen.`,
    })(ziel, schluessel);
  };

export const NichtNurLeerzeichen = (feld: string): PropertyDecorator =>
  Matches(/\S/u, { message: `${feld} darf nicht leer sein.` });
