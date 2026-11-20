import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Serienmails1792303500000 implements MigrationInterface {
  name = 'Serienmails1792303500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kampagnen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "betreff" character varying(200) NOT NULL,
        "text" text NOT NULL,
        "thema" character varying(60) NOT NULL DEFAULT 'allgemein',
        "status" character varying(20) NOT NULL DEFAULT 'entwurf',
        "erstelltVon" uuid NOT NULL,
        "absenderId" uuid,
        "gestartetAm" TIMESTAMP WITH TIME ZONE,
        "beendetAm" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kampagnen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kampagnen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_kampagnen_bereich" ON "kampagnen" ("workspaceId", "createdAt")`,
    );
    await queryRunner.query(`
      CREATE TABLE "kampagnen_empfaenger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kampagneId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "contactId" uuid,
        "email" character varying(320),
        "vorname" character varying(100) NOT NULL DEFAULT '',
        "nachname" character varying(100) NOT NULL DEFAULT '',
        "firma" character varying(200) NOT NULL DEFAULT '',
        "status" character varying(20) NOT NULL,
        "grund" character varying(300),
        "gesendetAm" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_kampagnen_empfaenger" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kampagnen_empfaenger_kampagne" FOREIGN KEY ("kampagneId")
          REFERENCES "kampagnen"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_kampagnen_empfaenger_status" ON "kampagnen_empfaenger" ("kampagneId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kampagnen_empfaenger_tag" ON "kampagnen_empfaenger" ("workspaceId", "gesendetAm")`,
    );
    await queryRunner.query(`
      CREATE TABLE "abmeldungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "email" character varying(320) NOT NULL,
        "thema" character varying(60) NOT NULL,
        "zeitpunkt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_abmeldungen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_abmeldungen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_abmeldungen_eindeutig" ON "abmeldungen" ("workspaceId", "email", "thema")`,
    );
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = "permissions" || '["workspace:campaigns"]'::jsonb
        WHERE "templateKey" = 'admin' AND NOT ("permissions" ? 'workspace:campaigns')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = "permissions" - 'workspace:campaigns'`,
    );
    await queryRunner.query(`DROP TABLE "abmeldungen"`);
    await queryRunner.query(`DROP TABLE "kampagnen_empfaenger"`);
    await queryRunner.query(`DROP TABLE "kampagnen"`);
  }
}
