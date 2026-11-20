import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddInvoiceSeries1792300400000 implements MigrationInterface {
  name = 'AddInvoiceSeries1792300400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoice_series" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "sourceInvoiceId" uuid NOT NULL,
        "interval" character varying(10) NOT NULL,
        "anchorDay" smallint NOT NULL,
        "nextRunOn" date NOT NULL,
        "endOn" date,
        "active" boolean NOT NULL DEFAULT true,
        "createdById" uuid,
        "lastInvoiceId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_series" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_series_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_series_source" FOREIGN KEY ("sourceInvoiceId")
          REFERENCES "invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_series_due" ON "invoice_series" ("active", "nextRunOn")`,
    );
    await queryRunner.query(`ALTER TABLE "invoices" ADD "seriesId" uuid`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "seriesId"`);
    await queryRunner.query(`DROP TABLE "invoice_series"`);
  }
}
