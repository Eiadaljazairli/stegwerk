import { type MigrationInterface, type QueryRunner } from 'typeorm';

import { ROLE_TEMPLATES } from '../../workspaces/permissions';

export class AddRoles1788420000000 implements MigrationInterface {
  name = 'AddRoles1788420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(60) NOT NULL,
        "description" character varying(300),
        "templateKey" character varying(20),
        "everything" boolean NOT NULL DEFAULT false,
        "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "isSystem" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_roles_workspace" ON "roles" ("workspaceId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_roles_workspace_name"
        ON "roles" ("workspaceId", "name")`,
    );

    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_roles_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    for (const template of ROLE_TEMPLATES) {
      await queryRunner.query(
        `INSERT INTO "roles"
          ("workspaceId", "name", "description", "templateKey", "everything",
           "permissions", "isSystem")
         SELECT w.id, $1, $2, $3, $4, $5::jsonb, true FROM "workspaces" w`,
        [
          template.name,
          template.description,
          template.key,
          template.everything,
          JSON.stringify(template.permissions),
        ],
      );
    }

    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN "roleId" uuid`,
    );

    await queryRunner.query(
      `UPDATE "memberships" m
        SET "roleId" = r.id
        FROM "roles" r
        WHERE r."workspaceId" = m."workspaceId"
          AND r."templateKey" = m."role"::text`,
    );

    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_memberships_role"
        FOREIGN KEY ("roleId") REFERENCES "roles"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_memberships_role" ON "memberships" ("roleId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "invitations" ADD COLUMN "roleId" uuid`,
    );

    await queryRunner.query(
      `UPDATE "invitations" i
        SET "roleId" = r.id
        FROM "roles" r
        WHERE r."workspaceId" = i."workspaceId"
          AND r."templateKey" = i."role"::text`,
    );

    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_invitations_role"
        FOREIGN KEY ("roleId") REFERENCES "roles"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_invitations_role"`,
    );
    await queryRunner.query(`ALTER TABLE "invitations" DROP COLUMN "roleId"`);
    await queryRunner.query(`DROP INDEX "IDX_memberships_role"`);
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_memberships_role"`,
    );
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN "roleId"`);
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_roles_workspace"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_roles_workspace_name"`);
    await queryRunner.query(`DROP INDEX "IDX_roles_workspace"`);
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}
