import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSavedViews1788392000000 implements MigrationInterface {
  name = 'AddSavedViews1788392000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "saved_views" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "entity" character varying(20) NOT NULL,
        "name" character varying(80) NOT NULL,
        "createdById" uuid NOT NULL,
        "search" character varying(200),
        "sortField" character varying(70),
        "sortDirection" character varying(4),
        "customFilters" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_30acd4fbe2058d97631ab9bb2b6" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_c0f0d3f489621a016ee658574e" ON "saved_views" ("workspaceId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_78c39b7bff36d701f5321d5434" ON "saved_views" ("workspaceId", "entity", "name")`,
    );

    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "FK_c0f0d3f489621a016ee658574e9" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD CONSTRAINT "FK_b3f0065fe4636badd3de9f8c0b8" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT "FK_b3f0065fe4636badd3de9f8c0b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP CONSTRAINT "FK_c0f0d3f489621a016ee658574e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_78c39b7bff36d701f5321d5434"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c0f0d3f489621a016ee658574e"`,
    );
    await queryRunner.query(`DROP TABLE "saved_views"`);
  }
}
