import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Feldrechte1792303400000 implements MigrationInterface {
  name = 'Feldrechte1792303400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "feldrechte" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "feldrechte"`);
  }
}
