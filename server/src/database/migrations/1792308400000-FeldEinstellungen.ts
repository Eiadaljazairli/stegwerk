import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FeldEinstellungen1792308400000 implements MigrationInterface {
  name = 'FeldEinstellungen1792308400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "einstellungen" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "einstellungen"`,
    );
  }
}
