import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMailboxSmtp1788970000000 implements MigrationInterface {
  name = 'AddMailboxSmtp1788970000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mailboxes"
        ADD COLUMN "smtpHost" character varying(200),
        ADD COLUMN "smtpPort" integer,
        ADD COLUMN "smtpSecure" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mailboxes"
        DROP COLUMN "smtpSecure",
        DROP COLUMN "smtpPort",
        DROP COLUMN "smtpHost"
    `);
  }
}
