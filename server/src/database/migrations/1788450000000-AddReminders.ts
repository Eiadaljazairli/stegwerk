import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddReminders1788450000000 implements MigrationInterface {
  name = 'AddReminders1788450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invoice_reminders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "invoiceId" uuid NOT NULL,
        "level" character varying(20) NOT NULL,
        "sentOn" date NOT NULL,
        "sentTo" character varying(320),
        "daysOverdue" integer NOT NULL DEFAULT 0,
        "interestCents" integer NOT NULL DEFAULT 0,
        "lateFeeCents" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_reminders" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_reminders_invoice"
        ON "invoice_reminders" ("workspaceId", "invoiceId", "sentOn")`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_reminders" ADD CONSTRAINT "FK_invoice_reminders_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_reminders" ADD CONSTRAINT "FK_invoice_reminders_invoice"
        FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN "consumer" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `UPDATE "invoices" SET "consumer" = true WHERE "companyId" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD COLUMN "baseInterestRatePercent" numeric(5,2)`,
    );

    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN "taskDigest" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN "lastDigestOn" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "lastDigestOn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "taskDigest"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "baseInterestRatePercent"`,
    );
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "consumer"`);
    await queryRunner.query(`DROP TABLE "invoice_reminders"`);
  }
}
