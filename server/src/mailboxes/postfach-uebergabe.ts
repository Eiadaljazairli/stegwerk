import { type EntityManager } from 'typeorm';

export const gemeinsamePostfaecherUebergeben = async (
  manager: EntityManager,
  workspaceId: string,
  vonId: string,
  anId: string,
): Promise<void> => {
  await manager.query(
    `UPDATE "oauth_zugaenge" z SET "userId" = $1
      WHERE z."workspaceId" = $2 AND z."userId" = $3
        AND z."id" IN (SELECT "oauthZugangId" FROM "mailboxes"
                        WHERE "workspaceId" = $2
                          AND "art" = 'gemeinsam'
                          AND "oauthZugangId" IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "oauth_zugaenge" andere
                         WHERE andere."workspaceId" = z."workspaceId"
                           AND andere."userId" = $1
                           AND andere."zweck" = z."zweck"
                           AND lower(andere."konto") = lower(z."konto"))`,
    [anId, workspaceId, vonId],
  );
  await manager.query(
    `INSERT INTO "mailbox_mitglieder" ("workspaceId", "mailboxId", "userId")
     SELECT "workspaceId", "id", $1 FROM "mailboxes"
      WHERE "workspaceId" = $2 AND "userId" = $3 AND "art" = 'gemeinsam'
     ON CONFLICT ("mailboxId", "userId") DO NOTHING`,
    [anId, workspaceId, vonId],
  );
  await manager.query(
    `UPDATE "mailboxes" SET "userId" = $1
      WHERE "workspaceId" = $2 AND "userId" = $3 AND "art" = 'gemeinsam'`,
    [anId, workspaceId, vonId],
  );
  await manager.query(
    `INSERT INTO "mailbox_mitglieder" ("workspaceId", "mailboxId", "userId")
     SELECT DISTINCT n."workspaceId", n."mailboxId", $1::uuid
       FROM "mail_messages" n
       JOIN "mailboxes" p ON p."id" = n."mailboxId" AND p."art" = 'gemeinsam'
      WHERE n."workspaceId" = $2 AND n."zugewiesenAnId" = $3
     ON CONFLICT ("mailboxId", "userId") DO NOTHING`,
    [anId, workspaceId, vonId],
  );
  await manager.query(
    `UPDATE "mail_messages" SET "zugewiesenAnId" = $1
      WHERE "workspaceId" = $2 AND "zugewiesenAnId" = $3`,
    [anId, workspaceId, vonId],
  );
  await manager.query(
    `DELETE FROM "mailbox_mitglieder" WHERE "workspaceId" = $1 AND "userId" = $2`,
    [workspaceId, vonId],
  );
};
