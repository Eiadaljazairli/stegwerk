import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Steuerbefreiung1792306600000 implements MigrationInterface {
  name = 'Steuerbefreiung1792306600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['quotes', 'invoices']) {
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "taxExemption" varchar(30)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "taxExemptionNote" varchar(300)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "recipientVatId" varchar(20)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['quotes', 'invoices']) {
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "recipientVatId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "taxExemptionNote"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "taxExemption"`,
      );
    }
  }
}
