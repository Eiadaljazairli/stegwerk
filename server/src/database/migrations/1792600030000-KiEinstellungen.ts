import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class KiEinstellungen1792600030000 implements MigrationInterface {
  name = 'KiEinstellungen1792600030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ki_einstellungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "anbieter" varchar(20) NOT NULL,
        "modell" varchar(80) NOT NULL,
        "schluesselVersiegelt" text NOT NULL,
        "nutzung" varchar(10) NOT NULL DEFAULT 'alle',
        "eingerichtetVonId" uuid,
        "geprueftAm" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ki_einstellungen" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ki_einstellungen_anbieter"
          CHECK ("anbieter" IN ('anthropic', 'openai')),
        CONSTRAINT "CHK_ki_einstellungen_nutzung"
          CHECK ("nutzung" IN ('alle', 'ki_recht')),
        CONSTRAINT "CHK_ki_einstellungen_versiegelt"
          CHECK ("schluesselVersiegelt" LIKE 'v2:%'),
        CONSTRAINT "FK_ki_einstellungen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ki_einstellungen_user" FOREIGN KEY ("eingerichtetVonId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ki_einstellungen_bereich" ON "ki_einstellungen" ("workspaceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ki_einstellungen"`);
  }
}
