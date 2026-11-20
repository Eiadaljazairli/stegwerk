import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWebForms1792300900000 implements MigrationInterface {
  name = 'AddWebForms1792300900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "web_forms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "ownerId" uuid NOT NULL,
        "title" character varying(120) NOT NULL DEFAULT 'Kontakt aufnehmen',
        "intro" character varying(500),
        "thankYou" character varying(500) NOT NULL DEFAULT 'Danke für Ihre Nachricht. Wir melden uns bald.',
        "privacyUrl" character varying(500),
        "createDeal" boolean NOT NULL DEFAULT true,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_web_forms" PRIMARY KEY ("id"),
        CONSTRAINT "FK_web_forms_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_web_forms_workspace" ON "web_forms" ("workspaceId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "web_forms"`);
  }
}
