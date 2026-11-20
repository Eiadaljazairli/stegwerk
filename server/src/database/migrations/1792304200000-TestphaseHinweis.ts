import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class TestphaseHinweis1792304200000 implements MigrationInterface {
  name = 'TestphaseHinweis1792304200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "testphaseHinweisAm" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "testphaseHinweisAm"`,
    );
  }
}
