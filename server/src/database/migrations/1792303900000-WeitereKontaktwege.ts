import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class WeitereKontaktwege1792303900000 implements MigrationInterface {
  name = 'WeitereKontaktwege1792303900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts"
        ADD "weitereEmails" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD "weitereTelefone" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_contacts_weitere_emails" ON "contacts" USING gin ("weitereEmails" jsonb_path_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_contacts_weitere_emails"`);
    await queryRunner.query(`
      ALTER TABLE "contacts"
        DROP COLUMN "weitereTelefone",
        DROP COLUMN "weitereEmails"
    `);
  }
}
