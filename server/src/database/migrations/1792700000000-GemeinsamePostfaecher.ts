import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class GemeinsamePostfaecher1792700000000 implements MigrationInterface {
  name = 'GemeinsamePostfaecher1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mailboxes"
        ADD "art" character varying(12) NOT NULL DEFAULT 'persoenlich',
        ADD "bezeichnung" character varying(100),
        ADD "haupt" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD CONSTRAINT "CHK_mailboxes_art" CHECK ("art" IN ('persoenlich', 'gemeinsam'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD CONSTRAINT "CHK_mailboxes_haupt" CHECK (NOT "haupt" OR "art" = 'persoenlich')`,
    );
    await queryRunner.query(`DROP INDEX "IDX_mailboxes_workspace_user"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailboxes_hauptpostfach" ON "mailboxes" ("workspaceId", "userId") WHERE "haupt"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mailboxes_workspace_user" ON "mailboxes" ("workspaceId", "userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailboxes_konto_persoenlich" ON "mailboxes" ("workspaceId", "userId", lower("username"), "host") WHERE "art" = 'persoenlich'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailboxes_konto_gemeinsam" ON "mailboxes" ("workspaceId", lower("username"), "host") WHERE "art" = 'gemeinsam'`,
    );

    await queryRunner.query(`
      CREATE TABLE "mailbox_mitglieder" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "mailboxId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mailbox_mitglieder" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mailbox_mitglieder_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mailbox_mitglieder_mailbox" FOREIGN KEY ("mailboxId")
          REFERENCES "mailboxes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mailbox_mitglieder_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailbox_mitglieder_postfach_person" ON "mailbox_mitglieder" ("mailboxId", "userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mailbox_mitglieder_person" ON "mailbox_mitglieder" ("workspaceId", "userId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "mail_messages"
        ADD "zugewiesenAnId" uuid,
        ADD "erledigtAm" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD CONSTRAINT "FK_mail_messages_zugewiesen" FOREIGN KEY ("zugewiesenAnId") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_messages_postfach_faden" ON "mail_messages" ("mailboxId", "threadKey")`,
    );

    await queryRunner.query(
      `ALTER TABLE "oauth_vorgaenge" ADD "postfachArt" character varying(12)`,
    );
    await queryRunner.query(`DROP INDEX "IDX_oauth_zugaenge_person_zweck"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_oauth_zugaenge_person_zweck" ON "oauth_zugaenge" ("workspaceId", "userId", "zweck") WHERE "zweck" <> 'postfach'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_oauth_zugaenge_postfach_konto" ON "oauth_zugaenge" ("workspaceId", "userId", lower("konto")) WHERE "zweck" = 'postfach'`,
    );

    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" || '["workspace:postfaecher"]'::jsonb
        WHERE "permissions" ? 'workspace:members'
          AND NOT ("permissions" ? 'workspace:postfaecher')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = "permissions" - 'workspace:postfaecher'`,
    );
    await queryRunner.query(
      `DELETE FROM "oauth_zugaenge" z
        WHERE z."zweck" = 'postfach'
          AND z."id" NOT IN (SELECT "oauthZugangId" FROM "mailboxes"
                              WHERE "haupt" AND "oauthZugangId" IS NOT NULL)
          AND EXISTS (SELECT 1 FROM "oauth_zugaenge" andere
                       WHERE andere."workspaceId" = z."workspaceId"
                         AND andere."userId" = z."userId"
                         AND andere."zweck" = 'postfach'
                         AND andere."id" <> z."id")`,
    );
    await queryRunner.query(`DROP INDEX "IDX_oauth_zugaenge_postfach_konto"`);
    await queryRunner.query(`DROP INDEX "IDX_oauth_zugaenge_person_zweck"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_oauth_zugaenge_person_zweck" ON "oauth_zugaenge" ("workspaceId", "userId", "zweck")`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_vorgaenge" DROP COLUMN "postfachArt"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_mail_messages_postfach_faden"`);
    await queryRunner.query(
      `ALTER TABLE "mail_messages" DROP CONSTRAINT "FK_mail_messages_zugewiesen"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_messages" DROP COLUMN "erledigtAm", DROP COLUMN "zugewiesenAnId"`,
    );
    await queryRunner.query(`DROP TABLE "mailbox_mitglieder"`);

    await queryRunner.query(`DELETE FROM "mailboxes" WHERE NOT "haupt"`);
    await queryRunner.query(`DROP INDEX "IDX_mailboxes_konto_gemeinsam"`);
    await queryRunner.query(`DROP INDEX "IDX_mailboxes_konto_persoenlich"`);
    await queryRunner.query(`DROP INDEX "IDX_mailboxes_workspace_user"`);
    await queryRunner.query(`DROP INDEX "IDX_mailboxes_hauptpostfach"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailboxes_workspace_user" ON "mailboxes" ("workspaceId", "userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP CONSTRAINT "CHK_mailboxes_haupt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP CONSTRAINT "CHK_mailboxes_art"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "haupt", DROP COLUMN "bezeichnung", DROP COLUMN "art"`,
    );
  }
}
