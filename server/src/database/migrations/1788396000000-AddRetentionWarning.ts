import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddRetentionWarning1788396000000 implements MigrationInterface {
  name = 'AddRetentionWarning1788396000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "retentionWarnedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "retentionWarnedAt"`,
    );
  }
}
