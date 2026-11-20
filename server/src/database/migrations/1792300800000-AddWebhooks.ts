import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWebhooks1792300800000 implements MigrationInterface {
  name = 'AddWebhooks1792300800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "url" character varying(500) NOT NULL,
        "events" text array NOT NULL,
        "secretSealed" text NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "lastStatus" smallint,
        "lastError" character varying(300),
        "lastDeliveredAt" TIMESTAMP WITH TIME ZONE,
        "failureCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhooks_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_webhooks_workspace_active" ON "webhooks" ("workspaceId", "active")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhooks"`);
  }
}
