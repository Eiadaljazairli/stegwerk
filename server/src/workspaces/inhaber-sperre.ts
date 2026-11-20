import { type EntityManager } from 'typeorm';

export const sperreInhaberschaft = async (
  manager: EntityManager,
  workspaceIds: string[],
): Promise<void> => {
  for (const id of [...new Set(workspaceIds)].sort()) {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('inhaber:' || $1, 0))`,
      [id],
    );
  }
};
