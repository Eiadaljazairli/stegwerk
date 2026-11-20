import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FirmaKontaktFelder1792308410000 implements MigrationInterface {
  name = 'FirmaKontaktFelder1792308410000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "zweitdomains" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "website" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "linkedin" character varying(500)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_companies_zweitdomains" ON "companies" USING gin ("zweitdomains")`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "street" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "postalCode" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "city" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "country" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "linkedin" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const spalte of [
      'linkedin',
      'country',
      'city',
      'postalCode',
      'street',
    ]) {
      await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "${spalte}"`);
    }

    await queryRunner.query(`DROP INDEX "IDX_companies_zweitdomains"`);

    for (const spalte of ['linkedin', 'website', 'zweitdomains']) {
      await queryRunner.query(
        `ALTER TABLE "companies" DROP COLUMN "${spalte}"`,
      );
    }
  }
}
