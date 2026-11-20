import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class WorkspaceForeignKeys1788384802254 implements MigrationInterface {
  name = 'WorkspaceForeignKeys1788384802254';

  private readonly tables = [
    'notes',
    'tasks',
    'deals',
    'contacts',
    'companies',
    'audit_log',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      const orphaned = `
                FROM "${table}" t
                WHERE NOT EXISTS (
                    SELECT 1 FROM "workspaces" w WHERE w.id = t."workspaceId"
                )
            `;

      const counted = await queryRunner.query(
        `SELECT count(*)::int AS count ${orphaned}`,
      );

      if (counted[0].count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `WorkspaceForeignKeys: removing ${counted[0].count} orphaned row(s) from ${table}`,
        );
      }

      await queryRunner.query(`DELETE ${orphaned}`);
    }

    await queryRunner.query(
      `ALTER TABLE "companies" ADD CONSTRAINT "FK_741e631f4f249e141282f001683" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD CONSTRAINT "FK_60c505f7ac4b3dae62c6fbc486f" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" ADD CONSTRAINT "FK_91d560cbcb178289a06c8784cce" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_d35fcd8fdf15d0bff825354d78a" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_f88dbead7aecbf13a1b40f7c882" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "FK_196f6aa223a2ce8a175347b6ded" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_196f6aa223a2ce8a175347b6ded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_f88dbead7aecbf13a1b40f7c882"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_d35fcd8fdf15d0bff825354d78a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deals" DROP CONSTRAINT "FK_91d560cbcb178289a06c8784cce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP CONSTRAINT "FK_60c505f7ac4b3dae62c6fbc486f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP CONSTRAINT "FK_741e631f4f249e141282f001683"`,
    );
  }
}
