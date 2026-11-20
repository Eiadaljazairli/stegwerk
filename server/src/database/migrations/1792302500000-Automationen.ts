import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Automationen1792302500000 implements MigrationInterface {
  name = 'Automationen1792302500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "automationen" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "name" character varying(120) NOT NULL, "aktiv" boolean NOT NULL DEFAULT true, "ausloeser" character varying(40) NOT NULL, "bedingung" jsonb NOT NULL DEFAULT '{}', "aktion" character varying(40) NOT NULL, "aktionDaten" jsonb NOT NULL DEFAULT '{}', "reihumZeiger" integer NOT NULL DEFAULT 0, "erstelltVon" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_automationen" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automationen_ausloeser" ON "automationen" ("workspaceId", "ausloeser")`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD CONSTRAINT "FK_automationen_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "automationen"`);
  }
}
