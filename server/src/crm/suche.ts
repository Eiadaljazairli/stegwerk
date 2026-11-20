export const MAX_SUCHWOERTER = 6;

export const MIN_UNSCHARF = 4;

export const UNSCHARF_SCHWELLE = 0.5;

export const suchWoerter = (text: string | null | undefined): string[] =>
  (text ?? '')
    .trim()
    .split(/\s+/u)
    .filter((wort) => wort !== '')
    .slice(0, MAX_SUCHWOERTER)
    .map((wort) => wort.slice(0, 100));

export const normSpalte = (alias: string, spalte: string, json: boolean) =>
  json
    ? `stegwerk_norm(CAST(${alias}."${spalte}" AS text))`
    : `stegwerk_norm(${alias}."${spalte}")`;

export const normWoertlich = (parameter: string) =>
  `replace(replace(replace(stegwerk_norm(:${parameter}), '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;

export const normMuster = (parameter: string) =>
  `'%' || ${normWoertlich(parameter)} || '%'`;

export const suchBedingung = (
  ausdruecke: string[],
  woerter: string[],
  prefix: string,
  unscharf = false,
): { where: string; parameters: Record<string, unknown> } | null => {
  if (ausdruecke.length === 0 || woerter.length === 0) {
    return null;
  }

  const parameters: Record<string, unknown> = {};
  const teile = woerter.map((wort, index) => {
    const muster = `${prefix}_w${String(index)}`;
    const roh = `${prefix}_r${String(index)}`;

    parameters[muster] = wort;

    const genau = ausdruecke.map(
      (ausdruck) => `${ausdruck} LIKE ${normMuster(muster)}`,
    );

    if (!unscharf || wort.length < MIN_UNSCHARF) {
      return `(${genau.join(' OR ')})`;
    }

    parameters[roh] = wort;

    const aehnlich = ausdruecke.map(
      (ausdruck) => `stegwerk_norm(:${roh}) <% ${ausdruck}`,
    );

    return `(${[...genau, ...aehnlich].join(' OR ')})`;
  });

  return { where: `(${teile.join(' AND ')})`, parameters };
};
