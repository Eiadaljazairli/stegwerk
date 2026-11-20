import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { getRequestContext } from '../observability/request-context';
import {
  alsRohesSql,
  eingeschraenktAuf,
  istSchreibbar,
  istSichtbar,
  NUR_LESEN,
  type SichtbarkeitsArt,
  sichtbarkeitsBedingung,
} from './sichtbarkeit';

export type Ziel = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

export const ZIELE: readonly [keyof Ziel, SichtbarkeitsArt, string][] = [
  ['companyId', 'company', 'companies'],
  ['contactId', 'contact', 'contacts'],
  ['dealId', 'deal', 'deals'],
];

type Bedingung = { where: string; parameters: Record<string, unknown> };

const ich = async (): Promise<string | null> => {
  const laden = getRequestContext()?.sichtfeld;

  return laden === undefined ? null : (await laden()).ich;
};

export const zielBedingung = async (
  alias: string,
  eigeneSpalte?: string,
  spalten: readonly (keyof Ziel)[] = ['companyId', 'contactId', 'dealId'],
): Promise<Bedingung | null> => {
  const teile: string[] = [];
  const parameters: Record<string, unknown> = {};

  for (const [spalte, art, tabelle] of ZIELE) {
    if (!spalten.includes(spalte)) {
      continue;
    }

    const akte = `${alias.replace(/\W/g, '_')}_${art}`;
    const bedingung = await sichtbarkeitsBedingung(art, akte);

    if (bedingung !== null) {
      teile.push(
        `(${alias}."${spalte}" IS NULL OR EXISTS (SELECT 1 FROM "${tabelle}" ${akte} WHERE ${akte}."id" = ${alias}."${spalte}" AND ${bedingung.where}))`,
      );
      Object.assign(parameters, bedingung.parameters);
    }
  }

  if (teile.length === 0) {
    return null;
  }

  const alle = teile.join(' AND ');
  const selbst = eigeneSpalte === undefined ? null : await ich();

  if (selbst === null) {
    return { where: `(${alle})`, parameters };
  }

  const param = `ziel_ich_${alias.replace(/\W/g, '_')}`;

  return {
    where: `(${alias}."${eigeneSpalte}" = :${param} OR (${alle}))`,
    parameters: { ...parameters, [param]: selbst },
  };
};

export const zielBedingungRoh = async (
  alias: string,
  naechsterParameter: number,
  eigeneSpalte?: string,
): Promise<{ sql: string; werte: unknown[] }> => {
  const bedingung = await zielBedingung(alias, eigeneSpalte);

  if (bedingung === null) {
    return { sql: '', werte: [] };
  }

  const { sql, werte } = alsRohesSql(bedingung, naechsterParameter);

  return { sql: ` AND ${sql}`, werte };
};

export const zielSichtbar = async (
  manager: EntityManager,
  ziel: Ziel,
  eigentuemer?: string | null,
): Promise<boolean> => {
  if (eigentuemer !== undefined && eigentuemer !== null) {
    const selbst = await ich();

    if (selbst !== null && selbst === eigentuemer) {
      return true;
    }
  }

  for (const [spalte, art, tabelle] of ZIELE) {
    const id = ziel[spalte];

    if (
      id === null ||
      id === undefined ||
      (await eingeschraenktAuf(art)) === null
    ) {
      continue;
    }

    const bedingung = await sichtbarkeitsBedingung(art, 'akte');

    if (bedingung === null) {
      continue;
    }

    const anzahl = await manager
      .createQueryBuilder()
      .from(tabelle, 'akte')
      .where('akte."id" = :akteId', { akteId: id })
      .andWhere(bedingung.where, bedingung.parameters)
      .getCount();

    if (anzahl === 0) {
      return false;
    }
  }

  return true;
};

export const nurSichtbareZeilen = async <T extends { id: string }>(
  manager: EntityManager,
  tabelle: string,
  zeilen: T[],
  eigeneSpalte?: string,
): Promise<T[]> => {
  const bedingung = await zielBedingung('zeile', eigeneSpalte);

  if (bedingung === null || zeilen.length === 0) {
    return zeilen;
  }

  const sichtbar = new Set(
    (
      await manager
        .createQueryBuilder()
        .select('zeile."id"', 'id')
        .from(tabelle, 'zeile')
        .where('zeile."id" IN (:...zeilenIds)', {
          zeilenIds: zeilen.map((zeile) => zeile.id),
        })
        .andWhere(bedingung.where, bedingung.parameters)
        .getRawMany<{ id: string }>()
    ).map((zeile) => zeile.id),
  );

  return zeilen.filter((zeile) => sichtbar.has(zeile.id));
};

export const irgendwoEingeschraenkt = async (): Promise<boolean> => {
  for (const [, art] of ZIELE) {
    if ((await eingeschraenktAuf(art)) !== null) {
      return true;
    }
  }

  return false;
};

export const neueZiele = (input: Ziel, vorher: Ziel): Ziel => ({
  companyId: input.companyId === vorher.companyId ? null : input.companyId,
  contactId: input.contactId === vorher.contactId ? null : input.contactId,
  dealId: input.dealId === vorher.dealId ? null : input.dealId,
});

export const assertZielSichtbar = async (
  manager: EntityManager,
  ziel: Ziel,
  meldung = 'Die Akte gibt es nicht.',
): Promise<void> => {
  if (!(await zielSichtbar(manager, ziel))) {
    throw new NotFoundException(meldung);
  }
};

export const sichtbareAkte = async <T extends { ownerId: string | null }>(
  art: SichtbarkeitsArt,
  akte: T | null | undefined,
): Promise<T | null> =>
  akte === null || akte === undefined
    ? null
    : (await istSichtbar(art, akte.ownerId, (akte as { id?: string }).id))
      ? akte
      : null;

const leer = (wert: string | null | undefined): wert is null | undefined =>
  wert === null || wert === undefined;

export const mehrfachZielBedingung = async (
  alias: string,
  eigeneSpalte?: string,
): Promise<Bedingung | null> => {
  const teile: string[] = [];
  const parameters: Record<string, unknown> = {};
  let eingeschraenkt = false;

  for (const [spalte, art, tabelle] of ZIELE) {
    const akte = `${alias.replace(/\W/g, '_')}_${art}`;
    const bedingung = await sichtbarkeitsBedingung(art, akte);

    if (bedingung === null) {
      teile.push(`${alias}."${spalte}" IS NOT NULL`);
      continue;
    }

    eingeschraenkt = true;
    teile.push(
      `EXISTS (SELECT 1 FROM "${tabelle}" ${akte} WHERE ${akte}."id" = ${alias}."${spalte}" AND ${bedingung.where})`,
    );
    Object.assign(parameters, bedingung.parameters);
  }

  if (!eingeschraenkt) {
    return null;
  }

  teile.push(
    `(${alias}."companyId" IS NULL AND ${alias}."contactId" IS NULL AND ${alias}."dealId" IS NULL)`,
  );

  const eine = teile.join(' OR ');
  const selbst = eigeneSpalte === undefined ? null : await ich();

  if (selbst === null) {
    return { where: `(${eine})`, parameters };
  }

  const param = `ziel_ich_${alias.replace(/\W/g, '_')}`;

  return {
    where: `(${alias}."${eigeneSpalte}" = :${param} OR ${eine})`,
    parameters: { ...parameters, [param]: selbst },
  };
};

export const notizBedingung = (alias: string): Promise<Bedingung | null> =>
  mehrfachZielBedingung(alias);

export const aufgabenBedingung = (alias: string): Promise<Bedingung | null> =>
  mehrfachZielBedingung(alias, 'assigneeId');

const akteLesen = async (
  manager: EntityManager,
  tabelle: string,
  id: string,
): Promise<{ ownerId: string | null } | undefined> => {
  const [zeile] = (await manager.query(
    `SELECT "ownerId" FROM "${tabelle}" WHERE "id" = $1`,
    [id],
  )) as { ownerId: string | null }[];

  return zeile;
};

export const mehrfachZielSichtbar = async (
  manager: EntityManager,
  ziel: Ziel,
  eigentuemer?: string | null,
): Promise<boolean> => {
  if (!leer(eigentuemer)) {
    const selbst = await ich();

    if (selbst !== null && selbst === eigentuemer) {
      return true;
    }
  }

  let gesetzt = false;

  for (const [spalte, art, tabelle] of ZIELE) {
    const id = ziel[spalte];

    if (leer(id)) {
      continue;
    }

    gesetzt = true;

    if ((await eingeschraenktAuf(art)) === null) {
      return true;
    }

    const akte = await akteLesen(manager, tabelle, id);

    if (akte !== undefined && (await istSichtbar(art, akte.ownerId, id))) {
      return true;
    }
  }

  return !gesetzt;
};

export const mehrfachZielSchreibbar = async (
  manager: EntityManager,
  ziel: Ziel,
): Promise<boolean> => {
  let gesetzt = false;
  let sichtbar = false;

  for (const [spalte, art, tabelle] of ZIELE) {
    const id = ziel[spalte];

    if (leer(id)) {
      continue;
    }

    gesetzt = true;

    if ((await eingeschraenktAuf(art)) === null) {
      sichtbar = true;
      continue;
    }

    const akte = await akteLesen(manager, tabelle, id);

    if (akte === undefined || !(await istSichtbar(art, akte.ownerId, id))) {
      continue;
    }

    sichtbar = true;

    if (!(await istSchreibbar(art, akte.ownerId, id))) {
      return false;
    }
  }

  return sichtbar || !gesetzt;
};

export const assertMehrfachZielSchreibbar = async (
  manager: EntityManager,
  ziel: Ziel,
): Promise<void> => {
  if (!(await mehrfachZielSchreibbar(manager, ziel))) {
    throw new ForbiddenException(NUR_LESEN);
  }
};

export const assertNeueZieleSchreibbar = async (
  manager: EntityManager,
  ziel: Ziel,
): Promise<void> => {
  for (const [spalte, art, tabelle] of ZIELE) {
    const id = ziel[spalte];

    if (leer(id) || (await eingeschraenktAuf(art)) === null) {
      continue;
    }

    const akte = await akteLesen(manager, tabelle, id);

    if (akte === undefined || !(await istSichtbar(art, akte.ownerId, id))) {
      throw new NotFoundException('Die Akte gibt es nicht.');
    }

    if (!(await istSchreibbar(art, akte.ownerId, id))) {
      throw new ForbiddenException(NUR_LESEN);
    }
  }
};

export const istIch = async (
  userId: string | null | undefined,
): Promise<boolean> => {
  if (leer(userId)) {
    return false;
  }

  const selbst = await ich();

  return selbst !== null && selbst === userId;
};

export const assertUnsichtbareZieleUnveraendert = async (
  manager: EntityManager,
  vorher: Ziel,
  input: Ziel,
): Promise<void> => {
  for (const [spalte, art, tabelle] of ZIELE) {
    const alt = vorher[spalte];
    const neu = input[spalte];

    if (
      neu === undefined ||
      leer(alt) ||
      neu === alt ||
      (await eingeschraenktAuf(art)) === null
    ) {
      continue;
    }

    const akte = await akteLesen(manager, tabelle, alt);

    if (akte !== undefined && !(await istSichtbar(art, akte.ownerId, alt))) {
      throw new ForbiddenException(
        'Diese Verknüpfung führt zu einem Eintrag, den Sie nicht sehen; ändern kann sie, wer ihn sieht.',
      );
    }
  }
};
