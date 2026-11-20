import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class RechtSchnittstelleProtokoll1792309500000 implements MigrationInterface {
  name = 'RechtSchnittstelleProtokoll1792309500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" || '["workspace:api", "workspace:audit"]'::jsonb
        WHERE "permissions" ? 'workspace:members'
          AND NOT ("permissions" ? 'workspace:api')`,
    );
    await queryRunner.query(
      `UPDATE "api_keys"
          SET "permissions" = "permissions" || ARRAY['workspace:api', 'workspace:audit']
        WHERE 'workspace:members' = ANY("permissions")
          AND NOT ('workspace:api' = ANY("permissions"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" - 'workspace:api' - 'workspace:audit'`,
    );
    await queryRunner.query(
      `UPDATE "api_keys"
          SET "permissions" = array_remove(array_remove("permissions", 'workspace:api'), 'workspace:audit')`,
    );
  }
}
