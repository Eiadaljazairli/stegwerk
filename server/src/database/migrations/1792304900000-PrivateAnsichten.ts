import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class PrivateAnsichten1792304900000 implements MigrationInterface {
  name = 'PrivateAnsichten1792304900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD "privat" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`DROP INDEX "IDX_78c39b7bff36d701f5321d5434"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_saved_views_team_name" ON "saved_views" ("workspaceId", "entity", "name") WHERE "privat" = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_saved_views_privat_name" ON "saved_views" ("workspaceId", "entity", "createdById", "name") WHERE "privat" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "saved_views" WHERE "privat" = true`);
    await queryRunner.query(`DROP INDEX "IDX_saved_views_privat_name"`);
    await queryRunner.query(`DROP INDEX "IDX_saved_views_team_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_78c39b7bff36d701f5321d5434" ON "saved_views" ("workspaceId", "entity", "name")`,
    );
    await queryRunner.query(`ALTER TABLE "saved_views" DROP COLUMN "privat"`);
  }
}
