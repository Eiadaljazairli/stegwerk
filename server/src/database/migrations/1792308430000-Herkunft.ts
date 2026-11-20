import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Herkunft1792308430000 implements MigrationInterface {
  name = 'Herkunft1792308430000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['companies', 'contacts', 'deals']) {
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "herkunft" character varying(20)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['companies', 'contacts', 'deals']) {
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "herkunft"`,
      );
    }
  }
}
