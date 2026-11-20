import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class PapierkorbFrist1792307400000 implements MigrationInterface {
  name = 'PapierkorbFrist1792307400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD "papierkorbTage" integer NOT NULL DEFAULT 30`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD CONSTRAINT "CHK_workspaces_papierkorbTage" CHECK ("papierkorbTage" BETWEEN 1 AND 365)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP CONSTRAINT "CHK_workspaces_papierkorbTage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "papierkorbTage"`,
    );
  }
}
