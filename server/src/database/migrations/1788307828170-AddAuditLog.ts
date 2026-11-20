import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLog1788307828170 implements MigrationInterface {
  name = 'AddAuditLog1788307828170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_log_action_enum" AS ENUM('created', 'updated', 'deleted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "actorId" uuid, "action" "public"."audit_log_action_enum" NOT NULL, "entityType" character varying(60) NOT NULL, "entityId" uuid NOT NULL, "summary" character varying(300), "changes" jsonb, "requestId" character varying(64), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_826d5a0332ddf7a494d6484cc8" ON "audit_log" ("workspaceId", "entityType", "entityId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_900219618dc1b6d4c01df3d9db" ON "audit_log" ("workspaceId", "createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_900219618dc1b6d4c01df3d9db"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_826d5a0332ddf7a494d6484cc8"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TYPE "public"."audit_log_action_enum"`);
  }
}
