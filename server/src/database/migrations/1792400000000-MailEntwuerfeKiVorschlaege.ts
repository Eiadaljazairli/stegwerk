import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class MailEntwuerfeKiVorschlaege1792400000000 implements MigrationInterface {
  name = 'MailEntwuerfeKiVorschlaege1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD "schreibmodus" character varying(12) NOT NULL DEFAULT 'direkt'`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "CHK_api_keys_schreibmodus" CHECK ("schreibmodus" IN ('direkt', 'vorschlag'))`,
    );

    await queryRunner.query(`
      CREATE TABLE "ki_vorschlaege" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "apiKeyId" uuid,
        "schluesselName" character varying(120) NOT NULL,
        "werkzeug" character varying(60) NOT NULL,
        "zusammenfassung" character varying(300) NOT NULL,
        "eingabe" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "vorher" jsonb,
        "nachher" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "zielArt" character varying(10),
        "zielId" uuid,
        "zielName" character varying(300),
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "status" character varying(12) NOT NULL DEFAULT 'offen',
        "entschiedenVonId" uuid,
        "entschiedenAm" TIMESTAMP WITH TIME ZONE,
        "grund" character varying(500),
        "ergebnis" jsonb,
        "fehler" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ki_vorschlaege" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ki_vorschlaege_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ki_vorschlaege_schluessel" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ki_vorschlaege_entschieden" FOREIGN KEY ("entschiedenVonId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ki_vorschlaege_status" CHECK ("status" IN ('offen', 'angenommen', 'verworfen')),
        CONSTRAINT "CHK_ki_vorschlaege_art" CHECK ("zielArt" IS NULL OR "zielArt" IN ('company', 'contact', 'deal', 'quote'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ki_vorschlaege_offen" ON "ki_vorschlaege" ("workspaceId", "status", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "mail_entwuerfe" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "ownerId" uuid NOT NULL,
        "an" text array NOT NULL DEFAULT '{}',
        "cc" text array NOT NULL DEFAULT '{}',
        "betreff" character varying(200) NOT NULL,
        "rumpf" text NOT NULL,
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "quelle" character varying(12) NOT NULL,
        "automationId" uuid,
        "kiVorschlagId" uuid,
        "status" character varying(12) NOT NULL DEFAULT 'entwurf',
        "gesendetAm" TIMESTAMP WITH TIME ZONE,
        "nachrichtId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mail_entwuerfe" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mail_entwuerfe_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mail_entwuerfe_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mail_entwuerfe_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_entwuerfe_contact" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_entwuerfe_deal" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_entwuerfe_automation" FOREIGN KEY ("automationId") REFERENCES "automationen"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_entwuerfe_vorschlag" FOREIGN KEY ("kiVorschlagId") REFERENCES "ki_vorschlaege"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_entwuerfe_nachricht" FOREIGN KEY ("nachrichtId") REFERENCES "mail_messages"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_mail_entwuerfe_quelle" CHECK ("quelle" IN ('automation', 'ki', 'hand')),
        CONSTRAINT "CHK_mail_entwuerfe_status" CHECK ("status" IN ('entwurf', 'sendet', 'gesendet', 'verworfen'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_entwuerfe_owner" ON "mail_entwuerfe" ("workspaceId", "ownerId", "status")`,
    );

    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" ADD "mailEntwurfId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" ADD CONSTRAINT "FK_benachrichtigungen_entwurf" FOREIGN KEY ("mailEntwurfId") REFERENCES "mail_entwuerfe"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" DROP CONSTRAINT "CHK_benachrichtigungen_ziel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" ADD CONSTRAINT "CHK_benachrichtigungen_ziel" CHECK ((("noteId" IS NOT NULL)::int + ("taskId" IS NOT NULL)::int + ("mailEntwurfId" IS NOT NULL)::int) = 1)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_benachrichtigungen_entwurf" ON "benachrichtigungen" ("empfaengerId", "mailEntwurfId") WHERE "mailEntwurfId" IS NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" || '["workspace:ki"]'::jsonb
        WHERE "permissions" ? 'workspace:api'
          AND NOT ("permissions" ? 'workspace:ki')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = "permissions" - 'workspace:ki'`,
    );
    await queryRunner.query(
      `DELETE FROM "benachrichtigungen" WHERE "mailEntwurfId" IS NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "UQ_benachrichtigungen_entwurf"`);
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" DROP CONSTRAINT "CHK_benachrichtigungen_ziel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" ADD CONSTRAINT "CHK_benachrichtigungen_ziel" CHECK (("noteId" IS NULL) <> ("taskId" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" DROP CONSTRAINT "FK_benachrichtigungen_entwurf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "benachrichtigungen" DROP COLUMN "mailEntwurfId"`,
    );
    await queryRunner.query(`DROP TABLE "mail_entwuerfe"`);
    await queryRunner.query(`DROP TABLE "ki_vorschlaege"`);
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP CONSTRAINT "CHK_api_keys_schreibmodus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP COLUMN "schreibmodus"`,
    );
  }
}
