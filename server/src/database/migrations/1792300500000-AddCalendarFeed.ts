import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCalendarFeed1792300500000 implements MigrationInterface {
  name = 'AddCalendarFeed1792300500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD "calendarFeedNonce" character varying(64)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "calendarFeedNonce"`,
    );
  }
}
