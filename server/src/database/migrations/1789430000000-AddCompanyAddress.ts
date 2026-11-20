import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCompanyAddress1789430000000 implements MigrationInterface {
  name = 'AddCompanyAddress1789430000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD "street" character varying(200),
        ADD "postalCode" character varying(20)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN "postalCode",
        DROP COLUMN "street"
    `);
  }
}
