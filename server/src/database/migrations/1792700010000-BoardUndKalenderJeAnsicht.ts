import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class BoardUndKalenderJeAnsicht1792700010000 implements MigrationInterface {
  name = 'BoardUndKalenderJeAnsicht1792700010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "gruppenFeld" varchar(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "datumFeld" varchar(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT IF EXISTS "CHK_saved_views_darstellung"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "CHK_saved_views_darstellung" ` +
        `CHECK ("darstellung" IS NULL OR "darstellung" IN ('liste', 'board', 'kalender'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "CHK_saved_views_felder" ` +
        `CHECK (("gruppenFeld" IS NULL OR "gruppenFeld" ~ '^(std|custom):[A-Za-z0-9_]{1,70}$') ` +
        `AND ("datumFeld" IS NULL OR "datumFeld" ~ '^(std|custom):[A-Za-z0-9_]{1,70}$'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT IF EXISTS "CHK_saved_views_felder"`,
    );
    await queryRunner.query(
      `UPDATE "saved_views" SET "darstellung" = NULL WHERE "darstellung" = 'kalender'`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT IF EXISTS "CHK_saved_views_darstellung"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "CHK_saved_views_darstellung" ` +
        `CHECK ("darstellung" IS NULL OR "darstellung" IN ('liste', 'board'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP COLUMN IF EXISTS "datumFeld"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP COLUMN IF EXISTS "gruppenFeld"`,
    );
  }
}
