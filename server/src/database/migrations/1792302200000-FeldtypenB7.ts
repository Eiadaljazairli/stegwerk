import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FeldtypenB71792302200000 implements MigrationInterface {
  name = 'FeldtypenB71792302200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "optionFarben" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "waehrung" character varying(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "eindeutig" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "eindeutig"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "waehrung"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "optionFarben"`,
    );
  }
}
