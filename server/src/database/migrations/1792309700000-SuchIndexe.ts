import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SuchIndexe1792309700000 implements MigrationInterface {
  name = 'SuchIndexe1792309700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_norm_tasks_description" ` +
        `ON "tasks" USING gin (stegwerk_norm("description") gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_norm_tasks_description"`,
    );
  }
}
