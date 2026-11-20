import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddQuoteOnlineDecision1792300200000 implements MigrationInterface {
  name = 'AddQuoteOnlineDecision1792300200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotes"
        ADD "publicLinkNonce" character varying(64),
        ADD "linkCreatedById" uuid,
        ADD "decidedByName" character varying(200),
        ADD "decidedOnline" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotes"
        DROP COLUMN "decidedOnline",
        DROP COLUMN "decidedByName",
        DROP COLUMN "linkCreatedById",
        DROP COLUMN "publicLinkNonce"
    `);
  }
}
