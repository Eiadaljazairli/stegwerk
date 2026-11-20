import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddInvoiceBuyerReference1792300000000 implements MigrationInterface {
  name = 'AddInvoiceBuyerReference1792300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "buyerReference" character varying(100)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN "buyerReference"`,
    );
  }
}
