import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Automationen21792303000000 implements MigrationInterface {
  name = 'Automationen21792303000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD "verzoegerungTage" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE TABLE "automation_ausfuehrungen" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "automationId" uuid NOT NULL, "zielArt" character varying(10) NOT NULL, "zielId" uuid NOT NULL, "status" character varying(20) NOT NULL, "grund" character varying(300), "faelligAm" TIMESTAMP WITH TIME ZONE NOT NULL, "erledigtAm" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_automation_ausfuehrungen" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_ausfuehrungen_faellig" ON "automation_ausfuehrungen" ("status", "faelligAm")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_ausfuehrungen_regel" ON "automation_ausfuehrungen" ("automationId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ADD CONSTRAINT "FK_automation_ausfuehrungen_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ADD CONSTRAINT "FK_automation_ausfuehrungen_automation" FOREIGN KEY ("automationId") REFERENCES "automationen"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE TABLE "automation_ruhend" ("automationId" uuid NOT NULL, "dealId" uuid NOT NULL, "letzteAktivitaet" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_automation_ruhend" PRIMARY KEY ("automationId", "dealId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ruhend" ADD CONSTRAINT "FK_automation_ruhend_automation" FOREIGN KEY ("automationId") REFERENCES "automationen"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ruhend" ADD CONSTRAINT "FK_automation_ruhend_deal" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "automation_ruhend"`);
    await queryRunner.query(`DROP TABLE "automation_ausfuehrungen"`);
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP COLUMN "verzoegerungTage"`,
    );
  }
}
