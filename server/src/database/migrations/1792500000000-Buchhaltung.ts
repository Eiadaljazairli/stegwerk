import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Buchhaltung1792500000000 implements MigrationInterface {
  name = 'Buchhaltung1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "buchhaltung_verbindungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "anbieter" varchar(20) NOT NULL,
        "schluesselVersiegelt" text NOT NULL,
        "kontoName" varchar(300),
        "kontoKennung" varchar(100),
        "automatisch" boolean NOT NULL DEFAULT true,
        "zahlungenAbgleichen" boolean NOT NULL DEFAULT true,
        "verbundenVonId" uuid,
        "anmeldungFehlerAm" timestamptz,
        "anmeldungFehler" varchar(500),
        "anmeldungGeprueftAm" timestamptz,
        "anbieterDaten" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_buchhaltung_verbindungen" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_buchhaltung_verbindungen_anbieter"
          CHECK ("anbieter" IN ('lexware', 'sevdesk')),
        CONSTRAINT "CHK_buchhaltung_verbindungen_versiegelt"
          CHECK ("schluesselVersiegelt" LIKE 'v2:%'),
        CONSTRAINT "FK_buchhaltung_verbindungen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_buchhaltung_verbindungen_user" FOREIGN KEY ("verbundenVonId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_buchhaltung_verbindungen_bereich" ON "buchhaltung_verbindungen" ("workspaceId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "buchhaltung_uebertragungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "invoiceId" uuid NOT NULL,
        "anbieter" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'wartet',
        "externeBelegId" varchar(100),
        "dateiAngehaengt" boolean NOT NULL DEFAULT false,
        "zuPruefen" boolean NOT NULL DEFAULT false,
        "versuche" integer NOT NULL DEFAULT 0,
        "naechsterVersuchAm" timestamptz,
        "gesperrtBis" timestamptz,
        "letzterFehler" varchar(500),
        "fehlerArt" varchar(20),
        "uebertragenAm" timestamptz,
        "zahlungGeprueftAm" timestamptz,
        "bezahltGemeldet" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_buchhaltung_uebertragungen" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_buchhaltung_uebertragungen_status"
          CHECK ("status" IN ('wartet', 'laeuft', 'uebertragen', 'fehler')),
        CONSTRAINT "FK_buchhaltung_uebertragungen_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_buchhaltung_uebertragungen_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_buchhaltung_uebertragungen_rechnung" ON "buchhaltung_uebertragungen" ("invoiceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_buchhaltung_uebertragungen_bereich" ON "buchhaltung_uebertragungen" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_buchhaltung_uebertragungen_faellig" ON "buchhaltung_uebertragungen" ("status", "naechsterVersuchAm")`,
    );

    await queryRunner.query(`
      CREATE TABLE "buchhaltung_kontakte" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "verbindungId" uuid NOT NULL,
        "art" varchar(10) NOT NULL,
        "datensatzId" uuid NOT NULL,
        "externeId" varchar(100) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_buchhaltung_kontakte" PRIMARY KEY ("id"),
        CONSTRAINT "FK_buchhaltung_kontakte_verbindung" FOREIGN KEY ("verbindungId")
          REFERENCES "buchhaltung_verbindungen"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_buchhaltung_kontakte_datensatz" ON "buchhaltung_kontakte" ("verbindungId", "art", "datensatzId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "buchhaltung_kontakte"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "buchhaltung_uebertragungen"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "buchhaltung_verbindungen"`);
  }
}
