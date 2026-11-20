import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SerienAusnahmen1792307200000 implements MigrationInterface {
  name = 'SerienAusnahmen1792307200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" ADD "serieId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "serieDatum" varchar(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_serie"
        FOREIGN KEY ("serieId") REFERENCES "appointments"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_appointments_serie_datum"
        ON "appointments" ("serieId", "serieDatum")
        WHERE "serieId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_appointments_serie_datum"`);
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_serie"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "serieDatum"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "serieId"`);
  }
}
