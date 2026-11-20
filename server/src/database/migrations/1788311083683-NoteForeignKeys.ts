import { MigrationInterface, QueryRunner } from 'typeorm';

export class NoteForeignKeys1788311083683 implements MigrationInterface {
  name = 'NoteForeignKeys1788311083683';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphans = await queryRunner.query(`
            SELECT count(*)::int AS count FROM "notes" n
            WHERE (n."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "companies" c WHERE c.id = n."companyId"))
               OR (n."contactId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "contacts" c WHERE c.id = n."contactId"))
               OR (n."dealId"    IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "deals" d    WHERE d.id = n."dealId"))
        `);

    if (orphans[0].count > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `NoteForeignKeys: removing ${orphans[0].count} orphaned note(s)`,
      );
    }

    await queryRunner.query(`
            DELETE FROM "notes" n
            WHERE (n."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "companies" c WHERE c.id = n."companyId"))
               OR (n."contactId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "contacts" c WHERE c.id = n."contactId"))
               OR (n."dealId"    IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "deals" d    WHERE d.id = n."dealId"))
        `);

    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_f7a947e11592aad0203a4466d4f" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_4b7a982140497a534912c785e98" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_33a1c0c89774a0d3ad00a752b3b" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_33a1c0c89774a0d3ad00a752b3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_4b7a982140497a534912c785e98"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_f7a947e11592aad0203a4466d4f"`,
    );
  }
}
