import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddInvoices1788440000000 implements MigrationInterface {
  name = 'AddInvoices1788440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invoice_counters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "year" integer NOT NULL,
        "lastSequence" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_invoice_counters" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoice_counters_workspace_year"
        ON "invoice_counters" ("workspaceId", "year")`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_counters" ADD CONSTRAINT "FK_invoice_counters_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "number" character varying(30),
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "quoteId" uuid,
        "correctsInvoiceId" uuid,
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "recipientAddress" text,
        "issuedOn" date NOT NULL,
        "serviceDate" date,
        "dueOn" date,
        "paymentTermDays" integer NOT NULL DEFAULT 14,
        "introText" text,
        "closingText" text,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "smallBusiness" boolean NOT NULL DEFAULT false,
        "issuedAt" TIMESTAMP WITH TIME ZONE,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoices_workspace_number"
        ON "invoices" ("workspaceId", "number")
        WHERE "number" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_workspace_status"
        ON "invoices" ("workspaceId", "status", "issuedOn" DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_quote"
        FOREIGN KEY ("quoteId") REFERENCES "quotes"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_corrects"
        FOREIGN KEY ("correctsInvoiceId") REFERENCES "invoices"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_company"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_contact"
        FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_deal"
        FOREIGN KEY ("dealId") REFERENCES "deals"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "invoice_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoiceId" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "name" character varying(200) NOT NULL,
        "articleNumber" character varying(60),
        "description" text,
        "quantity" numeric(12,3) NOT NULL,
        "unit" character varying(20) NOT NULL,
        "unitPriceCents" integer NOT NULL DEFAULT 0,
        "discountPercent" numeric(5,2) NOT NULL DEFAULT 0,
        "taxRatePercent" integer NOT NULL DEFAULT 19,
        CONSTRAINT "PK_invoice_lines" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_lines_invoice"
        ON "invoice_lines" ("invoiceId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_lines" ADD CONSTRAINT "FK_invoice_lines_invoice"
        FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invoice_lines"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TABLE "invoice_counters"`);
  }
}
