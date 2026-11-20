import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Visitenkarte1792305900000 implements MigrationInterface {
  name = 'Visitenkarte1792305900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "funktion" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "durchwahl" character varying(50)`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "mailSignatur" text`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD "bearbeiterId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_quotes_bearbeiter" FOREIGN KEY ("bearbeiterId") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotes" DROP CONSTRAINT "FK_quotes_bearbeiter"`,
    );
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN "bearbeiterId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mailSignatur"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "durchwahl"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "funktion"`);
  }
}
