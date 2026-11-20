export const ohneDoppelteTermine = <T extends { id: string }>(
  ...listen: T[][]
): T[] => {
  const gesehen = new Set<string>();

  return listen.flat().filter((termin) => {
    if (gesehen.has(termin.id)) {
      return false;
    }

    gesehen.add(termin.id);

    return true;
  });
};

export const istBelegt = (termin: { geschwaerzt?: boolean | null }): boolean =>
  termin.geschwaerzt === true;
