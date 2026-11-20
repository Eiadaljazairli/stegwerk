import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AboHinweisNachweis1792400050000 implements MigrationInterface {
  name = 'AboHinweisNachweis1792400050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions"
         ADD COLUMN IF NOT EXISTS "abrechnungsIntervall" varchar(10),
         ADD COLUMN IF NOT EXISTS "verlaengerungHinweisFuer" timestamptz`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "arbeitsnachweise" (
         "signatur" varchar(64) PRIMARY KEY,
         "ablauf" timestamptz NOT NULL
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_arbeitsnachweise_ablauf"
         ON "arbeitsnachweise" ("ablauf")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "arbeitsnachweise"`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions"
         DROP COLUMN IF EXISTS "verlaengerungHinweisFuer",
         DROP COLUMN IF EXISTS "abrechnungsIntervall"`,
    );
  }
}
