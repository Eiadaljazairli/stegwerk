import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InvoicePermissionsForSystemRoles1788441000000 implements MigrationInterface {
  name = 'InvoicePermissionsForSystemRoles1788441000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions"
            || '["invoice:view", "invoice:write", "invoice:issue"]'::jsonb
        WHERE "isSystem" = true
          AND "templateKey" IN ('admin', 'member')
          AND NOT ("permissions" ? 'invoice:view')`,
    );

    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" || '["invoice:view"]'::jsonb
        WHERE "isSystem" = true
          AND "templateKey" = 'readonly'
          AND NOT ("permissions" ? 'invoice:view')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = (
            SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
              FROM jsonb_array_elements("permissions") AS value
             WHERE value NOT IN ('"invoice:view"', '"invoice:write"', '"invoice:issue"')
          )
        WHERE "isSystem" = true`,
    );
  }
}
