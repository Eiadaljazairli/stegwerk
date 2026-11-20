import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Betriebsueberwachung1792305000000 implements MigrationInterface {
  name = 'Betriebsueberwachung1792305000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "geplante_laeufe" (
        "name" character varying(60) NOT NULL,
        "intervallSek" integer NOT NULL,
        "aktiv" boolean NOT NULL DEFAULT true,
        "angemeldetAm" TIMESTAMP WITH TIME ZONE NOT NULL,
        "letzterStart" TIMESTAMP WITH TIME ZONE,
        "letztesEnde" TIMESTAMP WITH TIME ZONE,
        "letzterErfolg" TIMESTAMP WITH TIME ZONE,
        "letzterFehlerAm" TIMESTAMP WITH TIME ZONE,
        "letzterFehler" character varying(500),
        "letzteDauerMs" integer,
        "laeufe" integer NOT NULL DEFAULT 0,
        "fehlerInFolge" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_geplante_laeufe" PRIMARY KEY ("name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ankuendigungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "text" character varying(500) NOT NULL,
        "von" TIMESTAMP WITH TIME ZONE NOT NULL,
        "bis" TIMESTAMP WITH TIME ZONE NOT NULL,
        "wartung" boolean NOT NULL DEFAULT false,
        "erstelltVon" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ankuendigungen" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ankuendigungen_zeitraum" CHECK ("bis" > "von")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ankuendigungen_zeitraum" ON "ankuendigungen" ("von", "bis")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ankuendigungen"`);
    await queryRunner.query(`DROP TABLE "geplante_laeufe"`);
  }
}
