import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Freigaben1792700050000 implements MigrationInterface {
  name = 'Freigaben1792700050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "freigaben" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "art" character varying(16) NOT NULL, "datensatzId" uuid NOT NULL, "userId" uuid NOT NULL, "stufe" character varying(16) NOT NULL, "erteiltVonId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_freigaben" PRIMARY KEY ("id"), CONSTRAINT "CHK_freigaben_art" CHECK ("art" IN ('company', 'contact', 'deal')), CONSTRAINT "CHK_freigaben_stufe" CHECK ("stufe" IN ('lesen', 'bearbeiten')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_freigaben_datensatz_person" ON "freigaben" ("workspaceId", "art", "datensatzId", "userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_freigaben_person" ON "freigaben" ("workspaceId", "userId", "art")`,
    );
    await queryRunner.query(
      `ALTER TABLE "freigaben" ADD CONSTRAINT "FK_freigaben_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "freigaben" ADD CONSTRAINT "FK_freigaben_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "freigaben" ADD CONSTRAINT "FK_freigaben_erteilt_von" FOREIGN KEY ("erteiltVonId") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "freigaben"`);
  }
}
