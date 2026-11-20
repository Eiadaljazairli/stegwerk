import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSavedViewDarstellung1792400040000 implements MigrationInterface {
  name = 'AddSavedViewDarstellung1792400040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "darstellung" varchar(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "CHK_saved_views_darstellung" ` +
        `CHECK ("darstellung" IS NULL OR "darstellung" IN ('liste', 'board'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT IF EXISTS "CHK_saved_views_darstellung"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP COLUMN IF EXISTS "darstellung"`,
    );
  }
}
