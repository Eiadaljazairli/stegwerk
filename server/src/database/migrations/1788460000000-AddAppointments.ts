import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAppointments1788460000000 implements MigrationInterface {
  name = 'AddAppointments1788460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "location" character varying(300),
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "allDay" boolean NOT NULL DEFAULT false,
        "ownerId" uuid NOT NULL,
        "createdById" uuid NOT NULL,
        "remindMinutesBefore" integer,
        "remindedAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "companyId" uuid,
        "contactId" uuid,
        "dealId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        -- Ein Termin, der endet, bevor er anfängt, ist keine Eingabe, die man
        -- freundlich zurechtrückt. Die Prüfung steht auch im Dienst; hier
        -- steht sie noch einmal, weil ein Einspielen von Daten am Dienst
        -- vorbeigeht und eine solche Zeile den Kalender in eine Schleife
        -- schickt.
        CONSTRAINT "CHK_appointments_order" CHECK ("endsAt" > "startsAt")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_appointments_span"
        ON "appointments" ("workspaceId", "startsAt")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_appointments_owner"
        ON "appointments" ("workspaceId", "ownerId", "startsAt")`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    for (const [column, table] of [
      ['companyId', 'companies'],
      ['contactId', 'contacts'],
      ['dealId', 'deals'],
    ]) {
      await queryRunner.query(
        `ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_${column}"
          FOREIGN KEY ("${column}") REFERENCES "${table}"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions"
            || '["appointment:view", "appointment:write"]'::jsonb
        WHERE "isSystem" = true
          AND "templateKey" IN ('admin', 'member')
          AND NOT ("permissions" ? 'appointment:view')`,
    );

    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = "permissions" || '["appointment:view"]'::jsonb
        WHERE "isSystem" = true
          AND "templateKey" = 'readonly'
          AND NOT ("permissions" ? 'appointment:view')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles"
          SET "permissions" = (
            SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
              FROM jsonb_array_elements("permissions") AS value
             WHERE value NOT IN ('"appointment:view"', '"appointment:write"')
          )
        WHERE "isSystem" = true`,
    );

    await queryRunner.query(`DROP TABLE "appointments"`);
  }
}
