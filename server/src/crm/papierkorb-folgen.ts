import { type EntityManager } from 'typeorm';

import { TaskEntity } from './entities/task.entity';

const AUFGABEN_SPALTE: Record<string, 'companyId' | 'contactId' | 'dealId'> = {
  CompanyEntity: 'companyId',
  ContactEntity: 'contactId',
  DealEntity: 'dealId',
};

const AUFGABEN_TABELLE: Record<'companyId' | 'contactId' | 'dealId', string> = {
  companyId: 'companies',
  contactId: 'contacts',
  dealId: 'deals',
};

const SPALTE_DER_TABELLE: Record<string, 'companyId' | 'contactId' | 'dealId'> =
  {
    companies: 'companyId',
    contacts: 'contactId',
    deals: 'dealId',
  };

export const mitInDenPapierkorb = async (
  manager: EntityManager,
  entity: string,
  workspaceId: string,
  id: string,
): Promise<void> => {
  const spalte = AUFGABEN_SPALTE[entity];

  if (spalte === undefined) {
    return;
  }

  const [zeile] = (await manager.query(
    `SELECT "deletedAt", "deletedById" FROM "${manager.getRepository(entity).metadata.tableName}" WHERE "id" = $1`,
    [id],
  )) as { deletedAt: Date | null; deletedById: string | null }[];

  if (zeile?.deletedAt === null || zeile === undefined) {
    return;
  }

  const andere = Object.entries(AUFGABEN_TABELLE)
    .filter(([andereSpalte]) => andereSpalte !== spalte)
    .map(
      ([andereSpalte, tabelle]) =>
        `(t."${andereSpalte}" IS NULL OR EXISTS (SELECT 1 FROM "${tabelle}" a WHERE a."id" = t."${andereSpalte}" AND a."deletedAt" IS NOT NULL))`,
    )
    .join(' AND ');

  await manager.query(
    `UPDATE "tasks" t SET "deletedAt" = $1, "deletedById" = $2
      WHERE t."workspaceId" = $3 AND t."${spalte}" = $4
        AND t."deletedAt" IS NULL AND ${andere}`,
    [zeile.deletedAt, zeile.deletedById, workspaceId, id],
  );
};

export const mehrfachZieleLoesen = async (
  manager: EntityManager,
  tabelle: 'companies' | 'contacts' | 'deals',
  bedingung: string,
  werte: unknown[],
): Promise<void> => {
  const spalte = SPALTE_DER_TABELLE[tabelle];
  const andere = Object.keys(AUFGABEN_TABELLE)
    .filter((andereSpalte) => andereSpalte !== spalte)
    .map((andereSpalte) => `z."${andereSpalte}" IS NOT NULL`)
    .join(' OR ');

  for (const ziel of ['notes', 'tasks']) {
    await manager.query(
      `UPDATE "${ziel}" z SET "${spalte}" = NULL
        WHERE (${andere})
          AND z."${spalte}" IN (SELECT weg."id" FROM "${tabelle}" weg WHERE ${bedingung})`,
      werte,
    );
  }
};

export const mitWiederherstellen = async (
  manager: EntityManager,
  entity: string,
  workspaceId: string,
  id: string,
  geloeschtAm: Date,
): Promise<void> => {
  const spalte = AUFGABEN_SPALTE[entity];

  if (spalte === undefined) {
    return;
  }

  await manager
    .createQueryBuilder()
    .update(TaskEntity)
    .set({ deletedAt: null, deletedById: null })
    .where('"workspaceId" = :workspaceId', { workspaceId })
    .andWhere(`"${spalte}" = :id`, { id })
    .andWhere('"deletedAt" = :geloeschtAm', { geloeschtAm })
    .execute();
};
