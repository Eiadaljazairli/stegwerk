import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ObjektBezeichnungen1792700030000 implements MigrationInterface {
  name = 'ObjektBezeichnungen1792700030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD "objektBezeichnungen" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "objektBezeichnungen"`,
    );
  }
}
