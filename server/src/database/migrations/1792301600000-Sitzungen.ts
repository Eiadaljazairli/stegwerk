import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Sitzungen1792301600000 implements MigrationInterface {
  name = 'Sitzungen1792301600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "familyId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "angemeldetAm" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "geraet" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "ipGekuerzt" character varying(45)`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "familyId" = "id", "angemeldetAm" = "createdAt" WHERE "familyId" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "ipGekuerzt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "geraet"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "angemeldetAm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "familyId"`,
    );
  }
}
