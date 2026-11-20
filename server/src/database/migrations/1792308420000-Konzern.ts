import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Konzern1792308420000 implements MigrationInterface {
  name = 'Konzern1792308420000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "parentCompanyId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_companies_parentCompanyId" ON "companies" ("parentCompanyId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD CONSTRAINT "FK_companies_parentCompany" FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP CONSTRAINT "FK_companies_parentCompany"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_companies_parentCompanyId"`);
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "parentCompanyId"`,
    );
  }
}
