import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddLetterhead1788402000000 implements MigrationInterface {
  name = 'AddLetterhead1788402000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workspace_letterheads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyName" character varying(200),
        "street" character varying(200),
        "postalCode" character varying(20),
        "city" character varying(120),
        "country" character varying(120),
        "phone" character varying(120),
        "email" character varying(200),
        "website" character varying(200),
        "representative" character varying(200),
        "registerEntry" character varying(200),
        "taxNumber" character varying(60),
        "vatId" character varying(30),
        "bankName" character varying(120),
        "iban" character varying(40),
        "bic" character varying(20),
        "smallBusiness" boolean NOT NULL DEFAULT false,
        "defaultValidityDays" integer NOT NULL DEFAULT 30,
        "defaultIntroText" text,
        "defaultClosingText" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_letterheads" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads"
        ADD CONSTRAINT "UQ_workspace_letterheads_workspace" UNIQUE ("workspaceId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads"
        ADD CONSTRAINT "FK_workspace_letterheads_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" DROP CONSTRAINT "FK_workspace_letterheads_workspace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" DROP CONSTRAINT "UQ_workspace_letterheads_workspace"`,
    );
    await queryRunner.query(`DROP TABLE "workspace_letterheads"`);
  }
}
