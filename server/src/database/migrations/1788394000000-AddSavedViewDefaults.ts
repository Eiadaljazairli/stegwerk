import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSavedViewDefaults1788394000000 implements MigrationInterface {
  name = 'AddSavedViewDefaults1788394000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "saved_view_defaults" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "entity" character varying(20) NOT NULL,
        "savedViewId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_view_defaults" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_saved_view_defaults_owner" ON "saved_view_defaults" ("userId", "workspaceId", "entity")`,
    );

    await queryRunner.query(
      `ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "FK_saved_view_defaults_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "FK_saved_view_defaults_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "FK_saved_view_defaults_view" FOREIGN KEY ("savedViewId") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "saved_view_defaults"`);
  }
}
