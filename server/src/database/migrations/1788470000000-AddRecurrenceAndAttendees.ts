import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddRecurrenceAndAttendees1788470000000 implements MigrationInterface {
  name = 'AddRecurrenceAndAttendees1788470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN "recurrence" character varying(300)`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointments"
        ADD COLUMN "skippedDates" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    await queryRunner.query(
      `CREATE TABLE "appointment_attendees" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "appointmentId" uuid NOT NULL,
        "contactId" uuid,
        "userId" uuid,
        "email" character varying(320),
        "name" character varying(200),
        "status" character varying(20) NOT NULL DEFAULT 'NEEDS_ACTION',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointment_attendees" PRIMARY KEY ("id"),
        -- Nie ein Kontakt und ein Kollege zugleich: zwei Verweise
        -- nebeneinander hießen, dass zwei Stellen sagen, wer gemeint ist, und
        -- irgendwann sagen sie Verschiedenes.
        --
        -- Und nie eine völlig leere Zeile. Der Name zählt dabei mit, obwohl
        -- er zum Anlegen nicht genügt: wird ein Kontakt gelöscht, setzt der
        -- Fremdschlüssel den Verweis auf NULL, und übrig bleibt genau eine
        -- Zeile mit nichts als dem mitgeschriebenen Namen. Wäre die
        -- verboten, ließe sich ein Kontakt nicht mehr löschen, solange er auf
        -- einer Teilnehmerliste steht — und damit wäre die Auskunft
        -- "gelöscht" nicht mehr zu geben.
        --
        -- Was zum Anlegen reicht, entscheidet der Dienst, und er ist
        -- strenger. Die Bedingung hier hält nur fest, was nach jedem Weg in
        -- die Tabelle noch wahr sein muss, auch nach einem Einspielen von
        -- Daten am Dienst vorbei.
        CONSTRAINT "CHK_appointment_attendees_one_kind" CHECK (
          NOT ("contactId" IS NOT NULL AND "userId" IS NOT NULL)
          AND (
            "contactId" IS NOT NULL
            OR "userId" IS NOT NULL
            OR ("email" IS NOT NULL AND "email" <> '')
            OR ("name" IS NOT NULL AND "name" <> '')
          )
        )
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_attendees_appointment"
        ON "appointment_attendees" ("workspaceId", "appointmentId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_attendees_contact"
        ON "appointment_attendees" ("workspaceId", "contactId")
        WHERE "contactId" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointment_attendees"
        ADD CONSTRAINT "FK_appointment_attendees_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointment_attendees"
        ADD CONSTRAINT "FK_appointment_attendees_appointment"
        FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointment_attendees"
        ADD CONSTRAINT "FK_appointment_attendees_contact"
        FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointment_attendees"
        ADD CONSTRAINT "FK_appointment_attendees_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "appointment_attendees"`);
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "skippedDates"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "recurrence"`,
    );
  }
}
