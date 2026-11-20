import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class KalenderSync1792303700000 implements MigrationInterface {
  name = 'KalenderSync1792303700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kalender_verbindungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "serverUrl" character varying(500) NOT NULL,
        "benutzer" character varying(200) NOT NULL,
        "passwortVersiegelt" text NOT NULL,
        "kalenderUrl" character varying(1000),
        "kalenderName" character varying(200),
        "letzterSyncAm" TIMESTAMP WITH TIME ZONE,
        "letzterFehler" character varying(500),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kalender_verbindungen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kalender_verbindungen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kalender_verbindungen_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_kalender_verbindungen_person" ON "kalender_verbindungen" ("workspaceId", "userId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "kalender_eintraege" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "verbindungId" uuid NOT NULL,
        "appointmentId" uuid,
        "href" character varying(1000) NOT NULL,
        "uid" character varying(500) NOT NULL,
        "etag" character varying(200),
        "lokalStand" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_kalender_eintraege" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kalender_eintraege_verbindung" FOREIGN KEY ("verbindungId")
          REFERENCES "kalender_verbindungen"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_kalender_eintraege_href" ON "kalender_eintraege" ("verbindungId", "href")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kalender_eintraege_termin" ON "kalender_eintraege" ("appointmentId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "quelle" character varying(20) NOT NULL DEFAULT 'stegwerk'`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "eingeladenAm" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "sequenz" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "sequenz"`);
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "eingeladenAm"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "quelle"`);
    await queryRunner.query(`DROP TABLE "kalender_eintraege"`);
    await queryRunner.query(`DROP TABLE "kalender_verbindungen"`);
  }
}
