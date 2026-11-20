import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitations1788302928114 implements MigrationInterface {
  name = 'AddInvitations1788302928114';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_role_enum" AS ENUM('owner', 'admin', 'member')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "email" character varying(320) NOT NULL, "role" "public"."invitations_role_enum" NOT NULL DEFAULT 'member', "tokenHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "acceptedAt" TIMESTAMP WITH TIME ZONE, "invitedById" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fd175905b95c6758d226a632d0" ON "invitations" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a6eb6f2543de8a5a4c148b32a1" ON "invitations" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_532e99e0b2a53828376b61d697" ON "invitations" ("workspaceId", "email") `,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_fd175905b95c6758d226a632d0e" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_fd175905b95c6758d226a632d0e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_532e99e0b2a53828376b61d697"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a6eb6f2543de8a5a4c148b32a1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd175905b95c6758d226a632d0"`,
    );
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TYPE "public"."invitations_role_enum"`);
  }
}
