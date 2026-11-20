import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Erwaehnungen1792308300000 implements MigrationInterface {
  name = 'Erwaehnungen1792308300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "benachrichtigungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "empfaengerId" uuid NOT NULL,
        "vonId" uuid,
        "art" character varying(30) NOT NULL,
        "noteId" uuid,
        "taskId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "gelesenAm" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_benachrichtigungen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_benachrichtigungen_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_benachrichtigungen_empfaenger" FOREIGN KEY ("empfaengerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_benachrichtigungen_von" FOREIGN KEY ("vonId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_benachrichtigungen_note" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_benachrichtigungen_task" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_benachrichtigungen_ziel" CHECK (("noteId" IS NULL) <> ("taskId" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_benachrichtigungen_empfaenger" ON "benachrichtigungen" ("empfaengerId", "workspaceId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_benachrichtigungen_notiz" ON "benachrichtigungen" ("empfaengerId", "noteId") WHERE "noteId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_benachrichtigungen_aufgabe" ON "benachrichtigungen" ("empfaengerId", "taskId") WHERE "taskId" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD "erwaehnungMail" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "erwaehnungMail"`,
    );
    await queryRunner.query(`DROP TABLE "benachrichtigungen"`);
  }
}
