import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AvvAnnahme1792303200000 implements MigrationInterface {
  name = 'AvvAnnahme1792303200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "avv_annahmen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid,
        "angenommenVon" character varying(200) NOT NULL,
        "auftraggeber" character varying(500) NOT NULL,
        "fassung" character varying(64) NOT NULL,
        "ipGekuerzt" character varying(64),
        "angenommenAm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_avv_annahmen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_avv_annahmen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_avv_annahmen_bereich" ON "avv_annahmen" ("workspaceId", "angenommenAm")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "avv_annahmen"`);
  }
}
