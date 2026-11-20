import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCompanyInvoiceEmail1792300100000 implements MigrationInterface {
  name = 'AddCompanyInvoiceEmail1792300100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "invoiceEmail" character varying(254)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "invoiceEmail"`,
    );
  }
}
