import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class KalenderPrivatPostfachFehlerVerteiler1792400010000 implements MigrationInterface {
  name = 'KalenderPrivatPostfachFehlerVerteiler1792400010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "privat" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen"
         ADD "sichtbarkeit" character varying(10) NOT NULL DEFAULT 'alles',
         ADD "fehlerArt" character varying(20),
         ADD "fehlversuche" integer NOT NULL DEFAULT 0,
         ADD "fehlerSeit" TIMESTAMP WITH TIME ZONE,
         ADD "fehlerMailAm" TIMESTAMP WITH TIME ZONE,
         ADD "letzterVersuchAm" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen" ALTER COLUMN "sichtbarkeit" SET DEFAULT 'belegt'`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen" ADD CONSTRAINT "CHK_kalender_verbindungen_sichtbarkeit" CHECK ("sichtbarkeit" IN ('alles', 'belegt'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes"
         ADD "ausschlussGmailKategorien" boolean NOT NULL DEFAULT true,
         ADD "fehlerArt" character varying(20),
         ADD "fehlversuche" integer NOT NULL DEFAULT 0,
         ADD "fehlerSeit" TIMESTAMP WITH TIME ZONE,
         ADD "fehlerMailAm" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(`
      CREATE TABLE "verteiler" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "beschreibung" character varying(500),
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verteiler" PRIMARY KEY ("id"),
        CONSTRAINT "FK_verteiler_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verteiler_ersteller" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_verteiler_name" ON "verteiler" ("workspaceId", lower("name"))`,
    );
    await queryRunner.query(`
      CREATE TABLE "verteiler_mitglieder" (
        "verteilerId" uuid NOT NULL,
        "contactId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "hinzugefuegtAm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verteiler_mitglieder" PRIMARY KEY ("verteilerId", "contactId"),
        CONSTRAINT "FK_verteiler_mitglieder_verteiler" FOREIGN KEY ("verteilerId") REFERENCES "verteiler"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verteiler_mitglieder_kontakt" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verteiler_mitglieder_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_verteiler_mitglieder_kontakt" ON "verteiler_mitglieder" ("workspaceId", "contactId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "verteiler_mitglieder"`);
    await queryRunner.query(`DROP TABLE "verteiler"`);
    await queryRunner.query(
      `ALTER TABLE "mailboxes"
         DROP COLUMN "fehlerMailAm", DROP COLUMN "fehlerSeit",
         DROP COLUMN "fehlversuche", DROP COLUMN "fehlerArt",
         DROP COLUMN "ausschlussGmailKategorien"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen" DROP CONSTRAINT "CHK_kalender_verbindungen_sichtbarkeit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen"
         DROP COLUMN "letzterVersuchAm",
         DROP COLUMN "fehlerMailAm", DROP COLUMN "fehlerSeit",
         DROP COLUMN "fehlversuche", DROP COLUMN "fehlerArt",
         DROP COLUMN "sichtbarkeit"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "privat"`);
  }
}
