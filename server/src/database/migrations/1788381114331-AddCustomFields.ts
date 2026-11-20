import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomFields1788381114331 implements MigrationInterface {
  name = 'AddCustomFields1788381114331';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "custom_fields" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "entity" character varying(20) NOT NULL, "key" character varying(60) NOT NULL, "label" character varying(100) NOT NULL, "type" character varying(20) NOT NULL, "options" jsonb NOT NULL DEFAULT '[]'::jsonb, "required" boolean NOT NULL DEFAULT false, "position" integer NOT NULL DEFAULT '0', "archivedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35ab958a0baec2e0b2b2b875fdb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7767853553ac1f7679d95ea873" ON "custom_fields" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a360ec8bde79cbd5b925ab37dc" ON "custom_fields" ("workspaceId", "entity", "key") `,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "customFields" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "customFields" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" ADD "customFields" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "customFields" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD CONSTRAINT "FK_7767853553ac1f7679d95ea8736" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP CONSTRAINT "FK_7767853553ac1f7679d95ea8736"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "customFields"`);
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "customFields"`);
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "customFields"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "customFields"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a360ec8bde79cbd5b925ab37dc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7767853553ac1f7679d95ea873"`,
    );
    await queryRunner.query(`DROP TABLE "custom_fields"`);
  }
}
