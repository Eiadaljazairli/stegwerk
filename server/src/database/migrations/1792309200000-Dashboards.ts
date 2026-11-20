import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Dashboards1792309200000 implements MigrationInterface {
  name = 'Dashboards1792309200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dashboards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(60) NOT NULL,
        "privat" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "kacheln" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dashboards_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dashboards_ersteller" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_dashboards_workspace" ON "dashboards" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_dashboards_geteilt" ON "dashboards" ("workspaceId", lower("name")) WHERE "privat" = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_dashboards_privat" ON "dashboards" ("workspaceId", "createdById", lower("name")) WHERE "privat" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dashboards"`);
  }
}
