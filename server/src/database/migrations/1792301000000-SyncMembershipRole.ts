import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SyncMembershipRole1792301000000 implements MigrationInterface {
  name = 'SyncMembershipRole1792301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "memberships" m
      SET "role" = CASE
        WHEN r."everything" THEN 'owner'
        WHEN r."templateKey" = 'admin' THEN 'admin'
        ELSE 'member'
      END::"memberships_role_enum"
      FROM "roles" r
      WHERE r."id" = m."roleId"
    `);
  }

  public async down(): Promise<void> {}
}
