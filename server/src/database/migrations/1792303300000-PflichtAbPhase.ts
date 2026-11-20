import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class PflichtAbPhase1792303300000 implements MigrationInterface {
  name = 'PflichtAbPhase1792303300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "pflichtAbPhase" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "pflichtAbPhase"`,
    );
  }
}
