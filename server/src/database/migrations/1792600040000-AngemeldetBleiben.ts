import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AngemeldetBleiben1792600040000 implements MigrationInterface {
  name = 'AngemeldetBleiben1792600040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "dauerhaft" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD "einladungsDomains" text[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN "einladungsDomains"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "dauerhaft"`,
    );
  }
}
