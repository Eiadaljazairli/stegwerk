import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Begleitbelege1792309600000 implements MigrationInterface {
  name = 'Begleitbelege1792309600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "begleitbelege" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "art" character varying(30) NOT NULL,
        "number" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'gestellt',
        "stornoVonId" uuid,
        "stornoGrund" character varying(500),
        "storniertAm" TIMESTAMP WITH TIME ZONE,
        "angebotId" uuid NOT NULL,
        "auftragsbestaetigungId" uuid,
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "bearbeiterId" uuid,
        "createdById" uuid,
        "recipientAddress" text,
        "lieferadresse" text,
        "issuedOn" date NOT NULL,
        "liefertermin" date,
        "introText" text,
        "closingText" text,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "smallBusiness" boolean NOT NULL DEFAULT false,
        "taxExemption" character varying(30),
        "taxExemptionNote" character varying(300),
        "recipientVatId" character varying(20),
        "issuerSnapshot" jsonb,
        "kontaktName" character varying(200),
        "bearbeiterSnapshot" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_begleitbelege" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_begleitbelege_art" CHECK ("art" IN ('auftragsbestaetigung', 'lieferschein')),
        CONSTRAINT "CHK_begleitbelege_status" CHECK ("status" IN ('gestellt', 'storniert')),
        CONSTRAINT "FK_begleitbelege_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_begleitbelege_storno" FOREIGN KEY ("stornoVonId") REFERENCES "begleitbelege"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_begleitbelege_angebot" FOREIGN KEY ("angebotId") REFERENCES "quotes"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_begleitbelege_ab" FOREIGN KEY ("auftragsbestaetigungId") REFERENCES "begleitbelege"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_begleitbelege_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_begleitbelege_contact" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_begleitbelege_deal" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_begleitbelege_bearbeiter" FOREIGN KEY ("bearbeiterId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_begleitbelege_ersteller" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_begleitbelege_nummer" ON "begleitbelege" ("workspaceId", "number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_begleitbelege_workspace" ON "begleitbelege" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_begleitbelege_angebot" ON "begleitbelege" ("angebotId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_begleitbelege_eine_ab" ON "begleitbelege" ("angebotId")
        WHERE "art" = 'auftragsbestaetigung' AND "status" = 'gestellt' AND "stornoVonId" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "begleitbeleg_positionen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "belegId" uuid NOT NULL,
        "angebotsPositionId" uuid,
        "position" integer NOT NULL DEFAULT 0,
        "name" character varying(200) NOT NULL,
        "articleNumber" character varying(60),
        "description" text,
        "quantity" numeric(12,3) NOT NULL,
        "unit" character varying(20) NOT NULL,
        "unitPriceCents" integer NOT NULL DEFAULT 0,
        "discountPercent" numeric(5,2) NOT NULL DEFAULT 0,
        "taxRatePercent" integer NOT NULL DEFAULT 19,
        "restOffen" numeric(12,3),
        CONSTRAINT "PK_begleitbeleg_positionen" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_begleitbeleg_positionen_menge" CHECK ("quantity" > 0),
        CONSTRAINT "FK_begleitbeleg_positionen_beleg" FOREIGN KEY ("belegId") REFERENCES "begleitbelege"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_begleitbeleg_positionen_angebot" FOREIGN KEY ("angebotsPositionId") REFERENCES "quote_lines"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_begleitbeleg_positionen_beleg" ON "begleitbeleg_positionen" ("belegId", "position")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_begleitbeleg_positionen_quelle" ON "begleitbeleg_positionen" ("angebotsPositionId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "begleitbeleg_zaehler" (
        "workspaceId" uuid NOT NULL,
        "art" character varying(30) NOT NULL,
        "year" integer NOT NULL,
        "lastSequence" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_begleitbeleg_zaehler" PRIMARY KEY ("workspaceId", "art", "year"),
        CONSTRAINT "FK_begleitbeleg_zaehler_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "begleitbeleg_zaehler"`);
    await queryRunner.query(`DROP TABLE "begleitbeleg_positionen"`);
    await queryRunner.query(`DROP TABLE "begleitbelege"`);
  }
}
