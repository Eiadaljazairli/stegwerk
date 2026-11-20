import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Leerlauf1792309510000 implements MigrationInterface {
  name = 'Leerlauf1792309510000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD "leerlaufMinuten" integer
         CONSTRAINT "CHK_workspaces_leerlauf"
         CHECK ("leerlaufMinuten" IS NULL OR "leerlaufMinuten" IN (30, 60, 240, 480))`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "letzteEingabeAm" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "letzteEingabeAm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "leerlaufMinuten"`,
    );
  }
}
