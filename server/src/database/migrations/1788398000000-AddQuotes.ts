import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddQuotes1788398000000 implements MigrationInterface {
  name = 'AddQuotes1788398000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "articleNumber" character varying(60),
        "description" text,
        "unitPriceCents" integer NOT NULL DEFAULT 0,
        "unit" character varying(20) NOT NULL DEFAULT 'Stück',
        "taxRatePercent" integer NOT NULL DEFAULT 19,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_products_workspace" ON "products" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_workspace_name" ON "products" ("workspaceId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "number" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "recipientAddress" text,
        "issuedOn" date NOT NULL,
        "validUntil" date NOT NULL,
        "introText" text,
        "closingText" text,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "smallBusiness" boolean NOT NULL DEFAULT false,
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotes" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_quotes_workspace" ON "quotes" ("workspaceId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_quotes_workspace_number" ON "quotes" ("workspaceId", "number")`,
    );

    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_quotes_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    for (const [column, table] of [
      ['companyId', 'companies'],
      ['contactId', 'contacts'],
      ['dealId', 'deals'],
    ]) {
      await queryRunner.query(
        `ALTER TABLE "quotes" ADD CONSTRAINT "FK_quotes_${column}" FOREIGN KEY ("${column}") REFERENCES "${table}"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE "quote_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quoteId" uuid NOT NULL,
        "productId" uuid,
        "position" integer NOT NULL DEFAULT 0,
        "name" character varying(200) NOT NULL,
        "articleNumber" character varying(60),
        "description" text,
        "quantity" numeric(12,3) NOT NULL DEFAULT 1,
        "unit" character varying(20) NOT NULL,
        "unitPriceCents" integer NOT NULL DEFAULT 0,
        "discountPercent" numeric(5,2) NOT NULL DEFAULT 0,
        "taxRatePercent" integer NOT NULL DEFAULT 19,
        CONSTRAINT "PK_quote_lines" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_quote_lines_quote" ON "quote_lines" ("quoteId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quote_lines_position" ON "quote_lines" ("quoteId", "position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_lines" ADD CONSTRAINT "FK_quote_lines_quote" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "quote_lines" ADD CONSTRAINT "FK_quote_lines_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quote_lines"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
