import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddDatevSettings1792300300000 implements MigrationInterface {
  name = 'AddDatevSettings1792300300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_letterheads"
        ADD "datevBeraternummer" character varying(7),
        ADD "datevMandantennummer" character varying(5),
        ADD "datevKontenrahmen" character varying(5) NOT NULL DEFAULT 'SKR03'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_letterheads"
        DROP COLUMN "datevKontenrahmen",
        DROP COLUMN "datevMandantennummer",
        DROP COLUMN "datevBeraternummer"
    `);
  }
}
