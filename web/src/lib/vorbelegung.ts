import { type CustomFieldFilter, type FilterVerknuepfung } from './types';

export const vorbelegungAusFiltern = (
  filter: CustomFieldFilter[],
  verknuepfung: FilterVerknuepfung,
  spalten: readonly string[],
  {
    nurIst = false,
    frei = () => true,
  }: { nurIst?: boolean; frei?: (spalte: string) => boolean } = {},
): Record<string, string> => {
  const oben = filter.filter((eintrag) => eintrag.gruppe === undefined);

  if (verknuepfung === 'ODER' && filter.length > 1) {
    return {};
  }

  const werte = new Map<string, Set<string>>();

  for (const eintrag of oben) {
    const spalte = eintrag.key.slice('std:'.length);
    const wert = eintrag.value?.trim() ?? '';

    if (
      eintrag.key.startsWith('std:') &&
      spalten.includes(spalte) &&
      frei(spalte) &&
      wert !== '' &&
      (eintrag.operator === 'EQUALS' ||
        (!nurIst && eintrag.operator === 'CONTAINS'))
    ) {
      werte.set(spalte, new Set([...(werte.get(spalte) ?? []), wert]));
    }
  }

  return Object.fromEntries(
    [...werte.entries()]
      .filter(([, satz]) => satz.size === 1)
      .map(([spalte, satz]) => [spalte, [...satz][0]]),
  );
};

export const mitVorbelegung = <T extends Record<string, string>>(
  form: T,
  werte: Record<string, string>,
): T => {
  const neu: Record<string, string> = { ...form };
  let geaendert = false;

  for (const [spalte, wert] of Object.entries(werte)) {
    if (spalte in neu && neu[spalte] === '') {
      neu[spalte] = wert;
      geaendert = true;
    }
  }

  return geaendert ? (neu as T) : form;
};

export const eingabeAusGruppe = (
  feld: string,
  gruppe: { wert: string | null; nichtSichtbar?: boolean },
  frei: (spalte: string) => boolean = () => true,
): Record<string, unknown> => {
  if (gruppe.wert === null || gruppe.nichtSichtbar === true) {
    return {};
  }

  if (!frei(feld.startsWith('std:') ? feld.slice('std:'.length) : feld)) {
    return {};
  }

  if (feld === 'std:stage') {
    return { stage: gruppe.wert.toUpperCase() };
  }

  if (feld.startsWith('std:')) {
    return { [feld.slice('std:'.length)]: gruppe.wert };
  }

  if (feld.startsWith('custom:')) {
    return { customFields: { [feld.slice('custom:'.length)]: gruppe.wert } };
  }

  return {};
};

export const mitGruppe = (
  eingabe: Record<string, unknown>,
  feld: string | undefined,
  gruppe: { wert: string | null; nichtSichtbar?: boolean } | undefined,
  frei?: (spalte: string) => boolean,
): Record<string, unknown> => {
  if (feld === undefined || gruppe === undefined) {
    return eingabe;
  }

  const aus = eingabeAusGruppe(feld, gruppe, frei);
  const eigene = {
    ...((eingabe.customFields as Record<string, unknown> | undefined) ?? {}),
    ...((aus.customFields as Record<string, unknown> | undefined) ?? {}),
  };

  return {
    ...eingabe,
    ...aus,
    ...(Object.keys(eigene).length > 0 ? { customFields: eigene } : {}),
  };
};
