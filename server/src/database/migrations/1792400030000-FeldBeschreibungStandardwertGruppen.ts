import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FeldBeschreibungStandardwertGruppen1792400030000 implements MigrationInterface {
  name = 'FeldBeschreibungStandardwertGruppen1792400030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "custom_field_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "entity" character varying(20) NOT NULL,
        "name" character varying(80) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "eingeklappt" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custom_field_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_custom_field_groups_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_custom_field_groups_workspace" ON "custom_field_groups" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_custom_field_groups_name" ON "custom_field_groups" ("workspaceId", "entity", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "beschreibung" character varying(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "standardwert" jsonb`,
    );
    await queryRunner.query(`ALTER TABLE "custom_fields" ADD "gruppeId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD CONSTRAINT "FK_custom_fields_gruppe"
        FOREIGN KEY ("gruppeId") REFERENCES "custom_field_groups"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_custom_fields_gruppe" ON "custom_fields" ("gruppeId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_custom_fields_gruppe"`);
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP CONSTRAINT "FK_custom_fields_gruppe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "gruppeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "standardwert"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "beschreibung"`,
    );
    await queryRunner.query(`DROP TABLE "custom_field_groups"`);
  }
}
