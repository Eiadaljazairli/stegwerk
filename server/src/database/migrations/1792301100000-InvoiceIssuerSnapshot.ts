import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InvoiceIssuerSnapshot1792301100000 implements MigrationInterface {
  name = 'InvoiceIssuerSnapshot1792301100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "issuerSnapshot" jsonb`,
    );
    await queryRunner.query(`
      UPDATE "invoices" i
      SET "issuerSnapshot" = jsonb_build_object(
        'companyName', l."companyName",
        'street', l."street",
        'postalCode', l."postalCode",
        'city', l."city",
        'country', l."country",
        'phone', l."phone",
        'email', l."email",
        'website', l."website",
        'representative', l."representative",
        'registerEntry', l."registerEntry",
        'taxNumber', l."taxNumber",
        'vatId', l."vatId",
        'bankName', l."bankName",
        'iban', l."iban",
        'bic', l."bic"
      )
      FROM "workspace_letterheads" l
      WHERE l."workspaceId" = i."workspaceId" AND i."number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN "issuerSnapshot"`,
    );
  }
}
