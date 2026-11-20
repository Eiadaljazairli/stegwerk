import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AnmeldenMitGoogleMicrosoft1792600010000 implements MigrationInterface {
  name = 'AnmeldenMitGoogleMicrosoft1792600010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "passwortGesetzt" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `CREATE TABLE "anmelde_verknuepfungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "anbieter" character varying(20) NOT NULL,
        "subjekt" character varying(255) NOT NULL,
        "email" character varying(320),
        "zuletztAm" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_anmelde_verknuepfungen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_anmelde_verknuepfungen_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_anmelde_verknuepfungen_subjekt" ON "anmelde_verknuepfungen" ("anbieter", "subjekt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_anmelde_verknuepfungen_konto" ON "anmelde_verknuepfungen" ("userId", "anbieter")`,
    );

    await queryRunner.query(
      `CREATE TABLE "anmelde_vorgaenge" (
        "stateHash" character varying(64) NOT NULL,
        "bindungHash" character varying(64) NOT NULL,
        "nonceHash" character varying(64) NOT NULL,
        "anbieter" character varying(20) NOT NULL,
        "zweck" character varying(20) NOT NULL,
        "userId" uuid,
        "arbeitsbereich" character varying(120),
        "verifierVersiegelt" text NOT NULL,
        "gueltigBis" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_anmelde_vorgaenge" PRIMARY KEY ("stateHash"),
        CONSTRAINT "FK_anmelde_vorgaenge_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "anmelde_einloesungen" (
        "tokenHash" character varying(64) NOT NULL,
        "bindungHash" character varying(64) NOT NULL,
        "userId" uuid NOT NULL,
        "anbieter" character varying(20) NOT NULL,
        "gueltigBis" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_anmelde_einloesungen" PRIMARY KEY ("tokenHash"),
        CONSTRAINT "FK_anmelde_einloesungen_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "anmelde_einloesungen"`);
    await queryRunner.query(`DROP TABLE "anmelde_vorgaenge"`);
    await queryRunner.query(`DROP TABLE "anmelde_verknuepfungen"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "passwortGesetzt"`,
    );
  }
}
