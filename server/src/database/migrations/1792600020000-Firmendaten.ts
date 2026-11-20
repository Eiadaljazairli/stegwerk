import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Firmendaten1792600020000 implements MigrationInterface {
  name = 'Firmendaten1792600020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD "phone" varchar(50),
        ADD "email" varchar(254),
        ADD "registergericht" varchar(120),
        ADD "registernummer" varchar(40),
        ADD "ustIdNr" varchar(20),
        ADD "vertretung" varchar(300)
    `);

    await queryRunner.query(`
      CREATE TABLE "firmenlogos" (
        "companyId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "bild" bytea NOT NULL,
        "mime" varchar(20) NOT NULL,
        "quelle" varchar(500) NOT NULL,
        "geholtAm" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_firmenlogos" PRIMARY KEY ("companyId"),
        CONSTRAINT "CHK_firmenlogos_mime" CHECK ("mime" IN (
          'image/png', 'image/jpeg', 'image/gif', 'image/webp',
          'image/x-icon'
        )),
        CONSTRAINT "CHK_firmenlogos_groesse"
          CHECK (octet_length("bild") BETWEEN 1 AND 204800),
        CONSTRAINT "FK_firmenlogos_company" FOREIGN KEY ("companyId")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_firmenlogos_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_firmenlogos_workspace" ON "firmenlogos" ("workspaceId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD "herkunft" varchar(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN "herkunft"`);
    await queryRunner.query(`DROP TABLE "firmenlogos"`);
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN "vertretung",
        DROP COLUMN "ustIdNr",
        DROP COLUMN "registernummer",
        DROP COLUMN "registergericht",
        DROP COLUMN "email",
        DROP COLUMN "phone"
    `);
  }
}
