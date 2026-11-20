import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Zeilenrechte1792302700000 implements MigrationInterface {
  name = 'Zeilenrechte1792302700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "sichtbarkeit" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "sichtbarkeit"`);
  }
}
