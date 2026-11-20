import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMailTemplates1792300700000 implements MigrationInterface {
  name = 'AddMailTemplates1792300700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mail_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "subject" character varying(300),
        "body" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mail_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mail_templates_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_templates_name" ON "mail_templates" ("workspaceId", "name")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mail_templates"`);
  }
}
