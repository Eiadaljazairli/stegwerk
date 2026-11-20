import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import {
  type DatensatzAenderung,
  hoereAufAenderungen,
} from '../crm/datensatz-ereignisse';

export const teilnehmerZuordnen = async (
  manager: EntityManager,
  workspaceId: string,
  eingrenzung: { contactId?: string; seit?: Date } = {},
): Promise<number> => {
  const ergebnis = (await manager.query(
    `WITH kandidaten AS (
       SELECT k."id", lower(k."email") AS adresse
         FROM "contacts" k
        WHERE k."workspaceId" = $1
          AND k."deletedAt" IS NULL
          AND k."email" IS NOT NULL
          AND ($2::uuid IS NULL OR k."id" = $2::uuid)
          AND ($3::timestamptz IS NULL OR k."updatedAt" >= $3::timestamptz)
       UNION
       SELECT k."id", lower(weitere->>'wert') AS adresse
         FROM "contacts" k,
              jsonb_array_elements(
                CASE WHEN jsonb_typeof(k."weitereEmails") = 'array'
                     THEN k."weitereEmails" ELSE '[]'::jsonb END
              ) AS weitere
        WHERE k."workspaceId" = $1
          AND k."deletedAt" IS NULL
          AND ($2::uuid IS NULL OR k."id" = $2::uuid)
          AND ($3::timestamptz IS NULL OR k."updatedAt" >= $3::timestamptz)
     ),
     paare AS (
       -- Je Termin und Kontakt höchstens eine Adresse.
       SELECT DISTINCT ON (t."appointmentId", c."id")
              t."id" AS teilnehmer, c."id" AS kontakt
         FROM "appointment_attendees" t
         JOIN kandidaten c ON c.adresse = lower(t."email")
        WHERE t."workspaceId" = $1
          AND t."contactId" IS NULL
          AND t."userId" IS NULL
          AND t."email" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "appointment_attendees" schon
                           WHERE schon."appointmentId" = t."appointmentId"
                             AND schon."contactId" = c."id")
        ORDER BY t."appointmentId", c."id", t."id"
     ),
     je_teilnehmer AS (
       -- Und je Adresse höchstens ein Kontakt (Dubletten mit gleicher Adresse).
       SELECT DISTINCT ON (teilnehmer) teilnehmer, kontakt
         FROM paare
        ORDER BY teilnehmer, kontakt
     )
     -- Die Adresse bleibt als Name, wenn keiner da ist: wird der Kontakt
     -- später gelöscht, bliebe sonst eine leere Zeile, die die Tabelle
     -- nicht zulässt, und das Löschen scheiterte.
     UPDATE "appointment_attendees" t
        SET "contactId" = j.kontakt,
            "name" = COALESCE(NULLIF(t."name", ''), left(t."email", 200)),
            "email" = NULL
       FROM je_teilnehmer j
      WHERE t."id" = j.teilnehmer`,
    [workspaceId, eingrenzung.contactId ?? null, eingrenzung.seit ?? null],
  )) as [unknown, number] | unknown[];

  return Array.isArray(ergebnis) && typeof ergebnis[1] === 'number'
    ? ergebnis[1]
    : 0;
};

@Injectable()
export class TeilnehmerZuordnung implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeilnehmerZuordnung.name);
  private abmelden: (() => void) | undefined;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.abmelden = hoereAufAenderungen((aenderung) => {
      void this.aufAenderung(aenderung).catch((fehler: unknown) =>
        this.logger.warn(
          `Teilnehmer nicht zugeordnet: ${
            fehler instanceof Error ? fehler.message : String(fehler)
          }`,
        ),
      );
    });
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  async aufAenderung(aenderung: DatensatzAenderung): Promise<number> {
    if (
      aenderung.entitaet !== 'ContactEntity' ||
      !(
        aenderung.felder.includes('email') ||
        aenderung.felder.includes('weitereEmails')
      )
    ) {
      return 0;
    }

    return teilnehmerZuordnen(this.dataSource.manager, aenderung.workspaceId, {
      contactId: aenderung.id,
    });
  }
}
