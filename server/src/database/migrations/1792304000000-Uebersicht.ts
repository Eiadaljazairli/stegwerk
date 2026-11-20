import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Uebersicht1792304000000 implements MigrationInterface {
  name = 'Uebersicht1792304000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "uebersichten" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "kacheln" jsonb NOT NULL DEFAULT '[]'::jsonb, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_uebersichten_person" UNIQUE ("userId", "workspaceId"), CONSTRAINT "PK_uebersichten" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "uebersichten" ADD CONSTRAINT "FK_uebersichten_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "uebersichten" ADD CONSTRAINT "FK_uebersichten_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "uebersichten"`);
  }
}
