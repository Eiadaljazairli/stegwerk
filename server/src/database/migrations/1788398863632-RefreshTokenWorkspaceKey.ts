import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class RefreshTokenWorkspaceKey1788398863632 implements MigrationInterface {
  name = 'RefreshTokenWorkspaceKey1788398863632';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphaned = `
            FROM "refresh_tokens" t
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
        `RefreshTokenWorkspaceKey: removing ${counted[0].count} orphaned refresh token(s)`,
      );
    }

    await queryRunner.query(`DELETE ${orphaned}`);

    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_bc965d3169f4093bc7a09ef2313" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_bc965d3169f4093bc7a09ef2313"`,
    );
  }
}
