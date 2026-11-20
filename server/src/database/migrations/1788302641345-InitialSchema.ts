import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788302641345 implements MigrationInterface {
  name = 'InitialSchema1788302641345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "name" character varying(200) NOT NULL, "domain" character varying(255), "industry" character varying(120), "employeeCount" integer, "annualRevenue" numeric(14,2), "city" character varying(120), "country" character varying(120), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_741e631f4f249e141282f00168" ON "companies" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_50f8ca3794efdf138c6a3383b8" ON "companies" ("workspaceId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "email" character varying(320), "phone" character varying(40), "jobTitle" character varying(150), "companyId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_60c505f7ac4b3dae62c6fbc486" ON "contacts" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6d21817c44150092a2b809bdb7" ON "contacts" ("workspaceId", "lastName") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."deals_stage_enum" AS ENUM('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')`,
    );
    await queryRunner.query(
      `CREATE TABLE "deals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "name" character varying(200) NOT NULL, "amount" numeric(14,2), "currency" character varying(3) NOT NULL DEFAULT 'EUR', "stage" "public"."deals_stage_enum" NOT NULL DEFAULT 'lead', "closeDate" date, "companyId" uuid, "primaryContactId" uuid, "ownerId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8c66f03b250f613ff8615940b4b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_91d560cbcb178289a06c8784cc" ON "deals" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_68f3327ea81a2e5eb427eba358" ON "deals" ("workspaceId", "stage") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "body" text NOT NULL, "companyId" uuid, "contactId" uuid, "dealId" uuid, "authorId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d35fcd8fdf15d0bff825354d78" ON "notes" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9c6142994f4d9601a2204e8098" ON "notes" ("workspaceId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workspaces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "slug" character varying(60) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b8e9fe62e93d60089dfc4f175f" ON "workspaces" ("slug") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."memberships_role_enum" AS ENUM('owner', 'admin', 'member')`,
    );
    await queryRunner.query(
      `CREATE TABLE "memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "role" "public"."memberships_role_enum" NOT NULL DEFAULT 'member', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b4aa57a22a5eb10228c7b21a8f" ON "memberships" ("userId", "workspaceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "passwordHash" character varying(255) NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD CONSTRAINT "FK_f4809f4f9ad4a220959788def42" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" ADD CONSTRAINT "FK_8824c76128d5ed303cec18e4d71" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" ADD CONSTRAINT "FK_62ca7b4d6d531b14d75f1a52ccc" FOREIGN KEY ("primaryContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_187d573e43b2c2aa3960df20b78" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_5a480a4394c7b8a74da1cb66a2f" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_5a480a4394c7b8a74da1cb66a2f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_187d573e43b2c2aa3960df20b78"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" DROP CONSTRAINT "FK_62ca7b4d6d531b14d75f1a52ccc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" DROP CONSTRAINT "FK_8824c76128d5ed303cec18e4d71"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP CONSTRAINT "FK_f4809f4f9ad4a220959788def42"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b4aa57a22a5eb10228c7b21a8f"`,
    );
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TYPE "public"."memberships_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b8e9fe62e93d60089dfc4f175f"`,
    );
    await queryRunner.query(`DROP TABLE "workspaces"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9c6142994f4d9601a2204e8098"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d35fcd8fdf15d0bff825354d78"`,
    );
    await queryRunner.query(`DROP TABLE "notes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_68f3327ea81a2e5eb427eba358"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_91d560cbcb178289a06c8784cc"`,
    );
    await queryRunner.query(`DROP TABLE "deals"`);
    await queryRunner.query(`DROP TYPE "public"."deals_stage_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6d21817c44150092a2b809bdb7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_60c505f7ac4b3dae62c6fbc486"`,
    );
    await queryRunner.query(`DROP TABLE "contacts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_50f8ca3794efdf138c6a3383b8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_741e631f4f249e141282f00168"`,
    );
    await queryRunner.query(`DROP TABLE "companies"`);
  }
}
