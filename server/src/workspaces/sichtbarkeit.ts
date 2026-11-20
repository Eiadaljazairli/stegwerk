import { ForbiddenException } from '@nestjs/common';

import { getRequestContext } from '../observability/request-context';
import { type Feldrechte } from './feldrechte';

export type SichtbarkeitsArt = 'company' | 'contact' | 'deal';

export type Sichtweite = 'alle' | 'eigene';

export type Sichtbarkeit = Record<SichtbarkeitsArt, Sichtweite>;

export type FreigabeStufe = 'lesen' | 'bearbeiten';

export const FREIGABE_STUFEN: readonly FreigabeStufe[] = [
  'lesen',
  'bearbeiten',
];

export type Freigabeliste = Partial<
  Record<SichtbarkeitsArt, ReadonlyMap<string, FreigabeStufe>>
>;

export const SICHTBARKEITS_ARTEN: SichtbarkeitsArt[] = [
  'company',
  'contact',
  'deal',
];

export const ALLES_SICHTBAR: Sichtbarkeit = {
  company: 'alle',
  contact: 'alle',
  deal: 'alle',
};

export const normalisiereSichtbarkeit = (roh: unknown): Sichtbarkeit => {
  const quelle = (roh ?? {}) as Partial<Record<string, unknown>>;

  return {
    company: quelle.company === 'eigene' ? 'eigene' : 'alle',
    contact: quelle.contact === 'eigene' ? 'eigene' : 'alle',
    deal: quelle.deal === 'eigene' ? 'eigene' : 'alle',
  };
};

export type Sichtfeld = {
  ich: string | null;
  arten: Sichtbarkeit;
  felder: Feldrechte;
  ohneRecht?: readonly SichtbarkeitsArt[];
  freigaben?: Freigabeliste;
};

export const ART_DER_ENTITAET: Record<string, SichtbarkeitsArt | undefined> = {
  CompanyEntity: 'company',
  ContactEntity: 'contact',
  DealEntity: 'deal',
};

export const setzeSichtfeld = (laden: () => Promise<Sichtfeld>): void => {
  const kontext = getRequestContext();

  if (kontext === undefined || kontext.sichtfeld !== undefined) {
    return;
  }

  let ergebnis: Promise<Sichtfeld> | undefined;

  kontext.sichtfeld = () => {
    ergebnis ??= laden();

    return ergebnis;
  };
};

export const eingeschraenktAuf = async (
  art: SichtbarkeitsArt,
): Promise<{
  ich: string | null;
  freigaben: ReadonlyMap<string, FreigabeStufe>;
} | null> => {
  const laden = getRequestContext()?.sichtfeld;

  if (laden === undefined) {
    return null;
  }

  const feld = await laden();

  return feld.arten[art] === 'eigene'
    ? {
        ich: feld.ich,
        freigaben:
          feld.ich === null
            ? new Map()
            : (feld.freigaben?.[art] ?? new Map<string, FreigabeStufe>()),
      }
    : null;
};

export const freigabeSql = (
  art: SichtbarkeitsArt,
  alias: string,
  param: string,
  stufen: readonly FreigabeStufe[] = FREIGABE_STUFEN,
): string => {
  const fg = `${alias.replace(/\W/g, '_')}_fg`;

  return `EXISTS (SELECT 1 FROM "freigaben" ${fg} WHERE ${fg}."workspaceId" = ${alias}."workspaceId" AND ${fg}."art" = '${art}' AND ${fg}."datensatzId" = ${alias}."id" AND ${fg}."userId" = :${param} AND ${fg}."stufe" IN (${stufen.map((stufe) => `'${stufe}'`).join(', ')}))`;
};

export const artOhneRecht = async (art: SichtbarkeitsArt): Promise<boolean> => {
  const laden = getRequestContext()?.sichtfeld;

  if (laden === undefined) {
    return false;
  }

  return (await laden()).ohneRecht?.includes(art) === true;
};

export const sichtbarkeitsBedingung = async (
  art: SichtbarkeitsArt,
  alias: string,
): Promise<{ where: string; parameters: Record<string, unknown> } | null> => {
  const grenze = await eingeschraenktAuf(art);

  if (grenze === null) {
    return null;
  }

  const param = `sichtbar_${alias.replace(/\W/g, '_')}`;

  return grenze.ich === null
    ? { where: `${alias}."ownerId" IS NULL`, parameters: {} }
    : {
        where: `(${alias}."ownerId" = :${param} OR ${alias}."ownerId" IS NULL OR ${freigabeSql(art, alias, param)})`,
        parameters: { [param]: grenze.ich },
      };
};

export const alsRohesSql = (
  bedingung: { where: string; parameters: Record<string, unknown> },
  ab: number,
): { sql: string; werte: unknown[] } => {
  let sql = bedingung.where;
  const werte: unknown[] = [];
  const namen = Object.keys(bedingung.parameters).sort(
    (a, b) => b.length - a.length,
  );

  for (const name of namen) {
    werte.push(bedingung.parameters[name]);
    sql = sql.replaceAll(`:${name}`, `$${String(ab + werte.length - 1)}`);
  }

  return { sql, werte };
};

export const istSichtbarFuer = (
  sicht: Sichtfeld,
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
  id: string | null | undefined,
): boolean =>
  sicht.arten[art] !== 'eigene' ||
  ownerId === null ||
  ownerId === undefined ||
  (sicht.ich !== null &&
    (ownerId === sicht.ich ||
      (id !== null &&
        id !== undefined &&
        sicht.freigaben?.[art]?.get(id) !== undefined)));

export const istSichtbar = async (
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
  id: string | null | undefined,
): Promise<boolean> => {
  const grenze = await eingeschraenktAuf(art);

  return (
    grenze === null ||
    ownerId === null ||
    ownerId === undefined ||
    (grenze.ich !== null &&
      (ownerId === grenze.ich ||
        (id !== null && id !== undefined && grenze.freigaben.has(id))))
  );
};

export const istSchreibbar = async (
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
  id: string | null | undefined,
): Promise<boolean> => {
  const grenze = await eingeschraenktAuf(art);

  return (
    grenze === null ||
    ownerId === null ||
    ownerId === undefined ||
    (grenze.ich !== null &&
      (ownerId === grenze.ich ||
        (id !== null &&
          id !== undefined &&
          grenze.freigaben.get(id) === 'bearbeiten')))
  );
};

export const NUR_LESEN =
  'Dieser Datensatz ist für Sie nur zum Lesen freigegeben. Ändern kann ihn, wer ihn verantwortet.';

export const assertSchreibbar = async (
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
  id: string | null | undefined,
): Promise<void> => {
  if (!(await istSchreibbar(art, ownerId, id))) {
    throw new ForbiddenException(NUR_LESEN);
  }
};

export const nurUeberFreigabe = async (
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
): Promise<boolean> => {
  const grenze = await eingeschraenktAuf(art);

  return (
    grenze !== null &&
    ownerId !== null &&
    ownerId !== undefined &&
    ownerId !== grenze.ich
  );
};

export const NUR_VERANTWORTLICHE =
  'Den Verantwortlichen ändert, wer den Datensatz verantwortet. Eine Freigabe erlaubt das nicht.';

export const assertVerantwortungAenderbar = async (
  art: SichtbarkeitsArt,
  ownerId: string | null | undefined,
  neu: string | null | undefined,
): Promise<void> => {
  if (neu === undefined || neu === (ownerId ?? null)) {
    return;
  }

  if (await nurUeberFreigabe(art, ownerId)) {
    throw new ForbiddenException(NUR_VERANTWORTLICHE);
  }
};
