import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMailThreading1788960000000 implements MigrationInterface {
  name = 'AddMailThreading1788960000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mail_messages"
        ADD COLUMN "inReplyTo" character varying(500),
        ADD COLUMN "references" text,
        ADD COLUMN "threadKey" character varying(500) NOT NULL DEFAULT ''
    `);

    await queryRunner.query(`
      UPDATE "mail_messages"
         SET "messageId" = trim(both '<>' from "messageId")
       WHERE "messageId" LIKE '<%' OR "messageId" LIKE '%>'
    `);

    await queryRunner.query(`
      UPDATE "mail_messages" SET "threadKey" = "messageId" WHERE "threadKey" = ''
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mail_messages_thread"
        ON "mail_messages" ("workspaceId", "threadKey", "sentAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_mail_messages_thread"`);
    await queryRunner.query(`
      ALTER TABLE "mail_messages"
        DROP COLUMN "threadKey",
        DROP COLUMN "references",
        DROP COLUMN "inReplyTo"
    `);
  }
}
