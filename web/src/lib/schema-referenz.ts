export type ReferenzArgument = { name: string; typ: string; vorgabe?: string };

export type ReferenzOperation = {
  name: string;
  beschreibung?: string;
  argumente: ReferenzArgument[];
  rueckgabe: string;
};

export type ReferenzTyp = {
  name: string;
  art: 'objekt' | 'eingabe' | 'aufzaehlung' | 'skalar';
  beschreibung?: string;
  felder?: { name: string; typ: string; argumente?: ReferenzArgument[] }[];
  werte?: string[];
};

export type Referenz = {
  abfragen: ReferenzOperation[];
  aenderungen: ReferenzOperation[];
  typen: ReferenzTyp[];
};

export const typTeile = (
  typ: string,
): { vor: string; name: string; nach: string } => {
  const treffer = /^([[\s]*)(\w+)(.*)$/u.exec(typ);

  return treffer === null
    ? { vor: '', name: typ, nach: '' }
    : { vor: treffer[1], name: treffer[2], nach: treffer[3] };
};

export const typAnker = (name: string): string => `typ-${name}`;

const klein = (text: string): string => text.toLowerCase();

const operationPasst = (op: ReferenzOperation, worte: string[]): boolean => {
  const text = klein(
    [
      op.name,
      op.rueckgabe,
      op.beschreibung ?? '',
      ...op.argumente.map((arg) => `${arg.name} ${arg.typ}`),
    ].join(' '),
  );

  return worte.every((wort) => text.includes(wort));
};

const typPasst = (typ: ReferenzTyp, worte: string[]): boolean => {
  const text = klein(
    [
      typ.name,
      typ.beschreibung ?? '',
      ...(typ.felder ?? []).map((feld) => `${feld.name} ${feld.typ}`),
      ...(typ.werte ?? []),
    ].join(' '),
  );

  return worte.every((wort) => text.includes(wort));
};

export const referenzSuche = (
  referenz: Referenz,
  begriff: string,
): Referenz => {
  const worte = klein(begriff)
    .split(/\s+/u)
    .filter((wort) => wort !== '');

  if (worte.length === 0) {
    return referenz;
  }

  return {
    abfragen: referenz.abfragen.filter((op) => operationPasst(op, worte)),
    aenderungen: referenz.aenderungen.filter((op) => operationPasst(op, worte)),
    typen: referenz.typen.filter((typ) => typPasst(typ, worte)),
  };
};

export const signatur = (op: {
  name: string;
  argumente?: ReferenzArgument[];
  rueckgabe?: string;
  typ?: string;
}): string => {
  const argumente =
    op.argumente === undefined || op.argumente.length === 0
      ? ''
      : `(${op.argumente
          .map(
            (arg) =>
              `${arg.name}: ${arg.typ}${arg.vorgabe === undefined ? '' : ` = ${arg.vorgabe}`}`,
          )
          .join(', ')})`;

  return `${op.name}${argumente}: ${op.rueckgabe ?? op.typ ?? ''}`;
};
