import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSavedViewColumns1788410000000 implements MigrationInterface {
  name = 'AddSavedViewColumns1788410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views"
        ADD COLUMN "columns" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_views" DROP COLUMN "columns"`);
  }
}
