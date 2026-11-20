import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class WebFormDailyLimit1792301200000 implements MigrationInterface {
  name = 'WebFormDailyLimit1792301200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "web_forms" ADD "heuteAnzahl" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "web_forms" ADD "heuteDatum" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "web_forms" DROP COLUMN "heuteDatum"`);
    await queryRunner.query(
      `ALTER TABLE "web_forms" DROP COLUMN "heuteAnzahl"`,
    );
  }
}
