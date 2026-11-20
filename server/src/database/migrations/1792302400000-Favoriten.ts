import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Favoriten1792302400000 implements MigrationInterface {
  name = 'Favoriten1792302400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favoriten" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "art" character varying(20) NOT NULL, "datensatzId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_favoriten_eintrag" UNIQUE ("userId", "workspaceId", "art", "datensatzId"), CONSTRAINT "PK_favoriten" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "favoriten" ADD CONSTRAINT "FK_favoriten_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "favoriten" ADD CONSTRAINT "FK_favoriten_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "favoriten"`);
  }
}
