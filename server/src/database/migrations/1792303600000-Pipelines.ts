import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Pipelines1792303600000 implements MigrationInterface {
  name = 'Pipelines1792303600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pipelines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(80) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pipelines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pipelines_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pipelines_bereich" ON "pipelines" ("workspaceId", "position")`,
    );

    await queryRunner.query(`ALTER TABLE "deals" ADD "pipelineId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "deals" ADD CONSTRAINT "FK_deals_pipeline" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deals_pipeline" ON "deals" ("workspaceId", "pipelineId")`,
    );

    await queryRunner.query(
      `INSERT INTO "pipelines" ("workspaceId", "name", "position")
       SELECT "id", 'Vertrieb', 0 FROM "workspaces"`,
    );
    await queryRunner.query(
      `UPDATE "deals" d SET "pipelineId" = p."id"
         FROM "pipelines" p WHERE p."workspaceId" = d."workspaceId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP CONSTRAINT "PK_deal_stage_settings"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD CONSTRAINT "PK_deal_stage_settings" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD "pipelineId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD CONSTRAINT "FK_deal_stage_settings_pipeline" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD "farbe" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD "ausgeblendet" boolean`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_deal_stage_settings_bereich" ON "deal_stage_settings" ("workspaceId", "stage") WHERE "pipelineId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_deal_stage_settings_pipeline" ON "deal_stage_settings" ("pipelineId", "stage") WHERE "pipelineId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "deal_stage_settings" WHERE "pipelineId" IS NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "UQ_deal_stage_settings_pipeline"`);
    await queryRunner.query(`DROP INDEX "UQ_deal_stage_settings_bereich"`);
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP COLUMN "ausgeblendet"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP COLUMN "farbe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP COLUMN "pipelineId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP CONSTRAINT "PK_deal_stage_settings"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" DROP COLUMN "id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_stage_settings" ADD CONSTRAINT "PK_deal_stage_settings" PRIMARY KEY ("workspaceId", "stage")`,
    );
    await queryRunner.query(`DROP INDEX "IDX_deals_pipeline"`);
    await queryRunner.query(
      `ALTER TABLE "deals" DROP CONSTRAINT "FK_deals_pipeline"`,
    );
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "pipelineId"`);
    await queryRunner.query(`DROP TABLE "pipelines"`);
  }
}
