export type Intervall = 'monthly' | 'quarterly' | 'yearly';

export const INTERVALLE: Intervall[] = ['monthly', 'quarterly', 'yearly'];

const MONATE: Record<Intervall, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const tageImMonat = (jahr: number, monat: number): number =>
  new Date(Date.UTC(jahr, monat, 0)).getUTCDate();

export const naechsterTermin = (
  datum: string,
  intervall: Intervall,
  ankerTag: number,
): string => {
  const jahr = Number(datum.slice(0, 4));
  const monat = Number(datum.slice(5, 7));
  const gesamt = jahr * 12 + (monat - 1) + MONATE[intervall];
  const neuesJahr = Math.floor(gesamt / 12);
  const neuerMonat = (gesamt % 12) + 1;
  const tag = Math.min(ankerTag, tageImMonat(neuesJahr, neuerMonat));

  return `${String(neuesJahr)}-${String(neuerMonat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
};
