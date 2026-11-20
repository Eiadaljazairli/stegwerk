import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SsoAngemeldetBleiben1792800000000 implements MigrationInterface {
  name = 'SsoAngemeldetBleiben1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "anmelde_vorgaenge" ADD "angemeldetBleiben" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "anmelde_einloesungen" ADD "angemeldetBleiben" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "anmelde_einloesungen" DROP COLUMN "angemeldetBleiben"`,
    );
    await queryRunner.query(
      `ALTER TABLE "anmelde_vorgaenge" DROP COLUMN "angemeldetBleiben"`,
    );
  }
}
