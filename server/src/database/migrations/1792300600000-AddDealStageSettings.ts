import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddDealStageSettings1792300600000 implements MigrationInterface {
  name = 'AddDealStageSettings1792300600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deal_stage_settings" (
        "workspaceId" uuid NOT NULL,
        "stage" character varying(20) NOT NULL,
        "label" character varying(40),
        "probability" smallint,
        CONSTRAINT "PK_deal_stage_settings" PRIMARY KEY ("workspaceId", "stage"),
        CONSTRAINT "FK_deal_stage_settings_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_deal_stage_settings_probability"
          CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100))
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "deals"
        ADD "probability" smallint,
        ADD CONSTRAINT "CHK_deals_probability"
          CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deals"
        DROP CONSTRAINT "CHK_deals_probability",
        DROP COLUMN "probability"
    `);
    await queryRunner.query(`DROP TABLE "deal_stage_settings"`);
  }
}
