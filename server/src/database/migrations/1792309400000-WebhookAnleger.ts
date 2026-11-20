import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class WebhookAnleger1792309400000 implements MigrationInterface {
  name = 'WebhookAnleger1792309400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "webhooks" ADD "createdById" uuid`);
    await queryRunner.query(`
      ALTER TABLE "webhooks"
        ADD CONSTRAINT "FK_webhooks_created_by"
        FOREIGN KEY ("createdById") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      UPDATE "webhooks" w SET "createdById" = (
        SELECT m."userId" FROM "memberships" m
         WHERE m."workspaceId" = w."workspaceId" AND m."role" = 'owner'
         ORDER BY m."createdAt" ASC
         LIMIT 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhooks" DROP CONSTRAINT "FK_webhooks_created_by"`,
    );
    await queryRunner.query(`ALTER TABLE "webhooks" DROP COLUMN "createdById"`);
  }
}
