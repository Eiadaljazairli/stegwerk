import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DealKontakte1792308200000 implements MigrationInterface {
  name = 'DealKontakte1792308200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "deal_kontakte" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "dealId" uuid NOT NULL,
        "contactId" uuid NOT NULL,
        "rolle" character varying(60),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_deal_kontakte_deal_kontakt" UNIQUE ("dealId", "contactId"),
        CONSTRAINT "PK_deal_kontakte" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deal_kontakte_workspace_kontakt" ON "deal_kontakte" ("workspaceId", "contactId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_kontakte" ADD CONSTRAINT "FK_deal_kontakte_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_kontakte" ADD CONSTRAINT "FK_deal_kontakte_deal" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deal_kontakte" ADD CONSTRAINT "FK_deal_kontakte_kontakt" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deal_kontakte"`);
  }
}
