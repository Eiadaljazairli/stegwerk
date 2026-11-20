import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class OAuthZugaenge1792304100000 implements MigrationInterface {
  name = 'OAuthZugaenge1792304100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "oauth_zugaenge" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "anbieter" character varying(20) NOT NULL,
        "zweck" character varying(20) NOT NULL,
        "konto" character varying(320) NOT NULL,
        "erneuerungVersiegelt" text NOT NULL,
        "zugriffVersiegelt" text,
        "zugriffBis" TIMESTAMP WITH TIME ZONE,
        "widerrufenAm" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_zugaenge" PRIMARY KEY ("id"),
        CONSTRAINT "FK_oauth_zugaenge_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_oauth_zugaenge_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_oauth_zugaenge_person_zweck" ON "oauth_zugaenge" ("workspaceId", "userId", "zweck")`,
    );
    await queryRunner.query(`
      CREATE TABLE "oauth_vorgaenge" (
        "stateHash" character varying(64) NOT NULL,
        "bindungHash" character varying(64) NOT NULL,
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "anbieter" character varying(20) NOT NULL,
        "zweck" character varying(20) NOT NULL,
        "verifierVersiegelt" text NOT NULL,
        "gueltigBis" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_vorgaenge" PRIMARY KEY ("stateHash")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "oauthZugangId" uuid, ADD "oauthAnbieter" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen" ADD "anbieter" character varying(20) NOT NULL DEFAULT 'caldav', ADD "oauthZugangId" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kalender_verbindungen" DROP COLUMN "oauthZugangId", DROP COLUMN "anbieter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "oauthAnbieter", DROP COLUMN "oauthZugangId"`,
    );
    await queryRunner.query(`DROP TABLE "oauth_vorgaenge"`);
    await queryRunner.query(`DROP TABLE "oauth_zugaenge"`);
  }
}
