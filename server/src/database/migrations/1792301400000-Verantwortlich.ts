import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Verantwortlich1792301400000 implements MigrationInterface {
  name = 'Verantwortlich1792301400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['companies', 'contacts', 'deals']) {
      await queryRunner.query(`ALTER TABLE "${tabelle}" ADD "ownerId" uuid`);
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" ADD CONSTRAINT "FK_${tabelle}_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_${tabelle}_workspace_owner" ON "${tabelle}" ("workspaceId", "ownerId")`,
      );
      await queryRunner.query(
        `UPDATE "${tabelle}" t SET "ownerId" = (
           SELECT m."userId" FROM "memberships" m
           WHERE m."workspaceId" = t."workspaceId" AND m."role" = 'owner'
           ORDER BY m."createdAt" LIMIT 1)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabelle of ['deals', 'contacts', 'companies']) {
      await queryRunner.query(`DROP INDEX "IDX_${tabelle}_workspace_owner"`);
      await queryRunner.query(
        `ALTER TABLE "${tabelle}" DROP CONSTRAINT "FK_${tabelle}_owner"`,
      );
      await queryRunner.query(`ALTER TABLE "${tabelle}" DROP COLUMN "ownerId"`);
    }
  }
}
