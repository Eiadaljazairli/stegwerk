import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAttachments1788480000000 implements MigrationInterface {
  name = 'AddAttachments1788480000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "name" text NOT NULL,
        "mimeType" text NOT NULL,
        "sizeBytes" integer NOT NULL,
        "uploadedById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "quoteId" uuid,
        "invoiceId" uuid,
        CONSTRAINT "PK_attachments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD CONSTRAINT "FK_attachments_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD CONSTRAINT "FK_attachments_uploaded_by"
        FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    for (const [spalte, tabelle] of [
      ['companyId', 'companies'],
      ['contactId', 'contacts'],
      ['dealId', 'deals'],
      ['quoteId', 'quotes'],
      ['invoiceId', 'invoices'],
    ]) {
      await queryRunner.query(`
        ALTER TABLE "attachments"
          ADD CONSTRAINT "FK_attachments_${spalte}"
          FOREIGN KEY ("${spalte}") REFERENCES "${tabelle}"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      `);
    }

    await queryRunner.query(`
      CREATE INDEX "IDX_attachments_workspace_created"
        ON "attachments" ("workspaceId", "createdAt")
    `);

    for (const spalte of [
      'companyId',
      'contactId',
      'dealId',
      'quoteId',
      'invoiceId',
    ]) {
      await queryRunner.query(`
        CREATE INDEX "IDX_attachments_${spalte}" ON "attachments" ("${spalte}")
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "attachment_blobs" (
        "attachmentId" uuid NOT NULL,
        "bytes" bytea NOT NULL,
        CONSTRAINT "PK_attachment_blobs" PRIMARY KEY ("attachmentId")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "attachment_blobs"
        ADD CONSTRAINT "FK_attachment_blobs_attachment"
        FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "attachment_blobs"`);
    await queryRunner.query(`DROP TABLE "attachments"`);
  }
}
