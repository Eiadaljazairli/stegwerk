export const LEERLAUF_STUFEN = [30, 60, 240, 480] as const;

export const istLeerlaufStufe = (minuten: number | null): boolean =>
  minuten === null || (LEERLAUF_STUFEN as readonly number[]).includes(minuten);

export const gemeldeteEingabe = (
  bisher: Date,
  gemeldet: number | null | undefined,
  jetzt: number,
): Date => {
  if (
    gemeldet === null ||
    gemeldet === undefined ||
    !Number.isFinite(gemeldet)
  ) {
    return bisher;
  }

  return new Date(Math.max(bisher.getTime(), Math.min(gemeldet, jetzt)));
};

export const zuLangeUntaetig = (
  letzteEingabe: Date,
  minuten: number | null,
  jetzt: number,
): boolean =>
  minuten !== null && jetzt - letzteEingabe.getTime() > minuten * 60_000;
