import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddApiKeys1789040000000 implements MigrationInterface {
  name = 'AddApiKeys1789040000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "kennung" character varying(64) NOT NULL,
        "hash" character varying(64) NOT NULL,
        "permissions" text[] NOT NULL DEFAULT '{}',
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "api_keys"
        ADD CONSTRAINT "FK_api_keys_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "api_keys"
        ADD CONSTRAINT "FK_api_keys_created_by"
        FOREIGN KEY ("createdById") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_api_keys_kennung" ON "api_keys" ("kennung")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_keys_workspace"
        ON "api_keys" ("workspaceId", "revokedAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_keys"`);
  }
}
