import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ZweiFaktorPflicht1792302000000 implements MigrationInterface {
  name = 'ZweiFaktorPflicht1792302000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD "zweiFaktorPflicht" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "zweiFaktorPflicht"`,
    );
  }
}
