import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Papierkorb1792301500000 implements MigrationInterface {
  name = 'Papierkorb1792301500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['companies', 'contacts', 'deals', 'tasks']) {
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD "deletedById" uuid`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_${tabelle}_papierkorb" ON "${tabelle}" ("workspaceId", "deletedAt") WHERE "deletedAt" IS NOT NULL`,
      );
    }

    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_action_enum" ADD VALUE IF NOT EXISTS 'restored'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['tasks', 'deals', 'contacts', 'companies']) {
      await queryRunner.query(
        `DELETE FROM "${tabelle}" WHERE "deletedAt" IS NOT NULL`,
      );
      await queryRunner.query(`DROP INDEX "IDX_${tabelle}_papierkorb"`);
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "deletedById"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP COLUMN "deletedAt"`,
      );
    }
  }
}
