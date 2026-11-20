import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import {
  type BetriebAenderung,
  type BetriebBereich,
  type BetriebKonto,
  type BetriebKontoDetail,
  type BetriebNutzung,
  type BetriebsUebersicht,
  type BetriebTag,
} from './betrieb.dto';

export const GRENZE = 500;

@Injectable()
export class BetriebService {
  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  istBetreiber(email: string): boolean {
    return this.betreiber().includes(email.trim().toLowerCase());
  }

  async pruefeBetreiber(userId: string): Promise<void> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOneBy({ id: userId });

    if (user === null || !this.istBetreiber(user.email)) {
      throw new ForbiddenException('Diese Seite ist nur für den Betreiber.');
    }

    if (user.emailVerifiedAt === null || user.totpEnabledAt === null) {
      throw new ForbiddenException(
        'Für diese Seite braucht das Konto eine bestätigte Adresse und die Zwei-Faktor-Anmeldung. Bitte unter Mehr → Team im Abschnitt „Zwei-Faktor-Anmeldung“ einschalten.',
      );
    }
  }

  private betreiber(): string[] {
    return this.config.get<string[]>('betreiberEmails') ?? [];
  }

  async uebersicht(userId: string): Promise<BetriebsUebersicht> {
    await this.pruefeBetreiber(userId);

    const mit = `WITH kunden AS (
         SELECT u.*, greatest(u."zuletztGesehenAt",
                  (SELECT max(r."createdAt") FROM "refresh_tokens" r WHERE r."userId" = u."id")) AS "aktiv"
         FROM "users" u WHERE lower(u."email") <> ALL($1::text[])
       ),
       kundenbereiche AS (
         SELECT w.* FROM "workspaces" w
         WHERE EXISTS (SELECT 1 FROM "memberships" m JOIN kunden k ON k."id" = m."userId"
                       WHERE m."workspaceId" = w."id")
       ) `;
    const betreiber = this.betreiber();

    const [zahlen] = (await this.dataSource.query(
      `${mit}
       SELECT
         (SELECT count(*) FROM kunden)::int AS "konten",
         (SELECT count(*) FROM kunden WHERE "emailVerifiedAt" IS NOT NULL)::int AS "bestaetigt",
         (SELECT count(*) FROM kunden WHERE "createdAt" > now() - interval '7 days')::int AS "neuDieseWoche",
         (SELECT count(*) FROM kunden WHERE "aktiv" > now() - interval '7 days')::int AS "aktivDieseWoche",
         (SELECT count(*) FROM kunden WHERE "totpEnabledAt" IS NOT NULL)::int AS "mitZweiFaktor",
         (SELECT count(*) FROM "invitations" i JOIN kundenbereiche b ON b."id" = i."workspaceId"
            WHERE i."acceptedAt" IS NULL AND i."expiresAt" > now())::int AS "offeneEinladungen",
         (SELECT count(*) FROM kundenbereiche)::int AS "arbeitsbereiche",
         (SELECT count(*) FROM "subscriptions" s JOIN kundenbereiche b ON b."id" = s."workspaceId"
            WHERE s."plan" <> 'trial' AND s."status" IN ('active', 'past_due'))::int AS "zahlend",
         (SELECT count(*) FROM "subscriptions" s JOIN kundenbereiche b ON b."id" = s."workspaceId"
            WHERE s."status" = 'trialing')::int AS "inTestphase"`,
      [betreiber],
    )) as BetriebsUebersicht['zahlen'][];

    const konten = (await this.dataSource.query(
      `${mit}
       SELECT u."id", u."email",
              trim(concat_ws(' ', u."firstName", u."lastName")) AS "name",
              u."emailVerifiedAt" IS NOT NULL AS "bestaetigt",
              u."totpEnabledAt" IS NOT NULL AS "zweiFaktor",
              (SELECT count(*) FROM "memberships" m WHERE m."userId" = u."id")::int AS "bereiche",
              coalesce((SELECT array_agg(w."name" || ' (' || CASE m."role" WHEN 'owner' THEN 'Inhaber' WHEN 'admin' THEN 'Admin' ELSE 'Mitglied' END || ')' ORDER BY w."createdAt")
                        FROM "memberships" m JOIN "workspaces" w ON w."id" = m."workspaceId"
                        WHERE m."userId" = u."id"), '{}') AS "bereichNamen",
              u."aktiv" AS "zuletztAktiv",
              u."createdAt" AS "angelegt"
       FROM kunden u
       ORDER BY u."aktiv" DESC NULLS LAST, u."createdAt" DESC
       LIMIT $2`,
      [betreiber, GRENZE],
    )) as BetriebKonto[];

    const bereiche = (await this.dataSource.query(
      `${mit}
       SELECT w."id", w."name",
              (SELECT count(*) FROM "memberships" m WHERE m."workspaceId" = w."id")::int AS "mitglieder",
              (SELECT u."email" FROM "memberships" m JOIN "users" u ON u."id" = m."userId"
                WHERE m."workspaceId" = w."id" AND m."role" = 'owner'
                ORDER BY m."createdAt" LIMIT 1) AS "inhaber",
              (SELECT count(*) FROM "companies" x WHERE x."workspaceId" = w."id" AND x."deletedAt" IS NULL)::int AS "firmen",
              (SELECT count(*) FROM "contacts" x WHERE x."workspaceId" = w."id" AND x."deletedAt" IS NULL)::int AS "kontakte",
              (SELECT count(*) FROM "deals" x WHERE x."workspaceId" = w."id" AND x."deletedAt" IS NULL)::int AS "geschaefte",
              (SELECT count(*) FROM "quotes" x WHERE x."workspaceId" = w."id")::int AS "angebote",
              (SELECT count(*) FROM "invoices" x WHERE x."workspaceId" = w."id")::int AS "rechnungen",
              (SELECT coalesce(sum(x."sizeBytes"), 0) FROM "attachments" x WHERE x."workspaceId" = w."id")::float8 AS "speicherBytes",
              (SELECT max(k."aktiv") FROM "memberships" m JOIN kunden k ON k."id" = m."userId"
                WHERE m."workspaceId" = w."id") AS "zuletztAktiv",
              s."plan", s."status",
              s."trialEndsAt" AS "testphaseBis",
              s."currentPeriodEnd" AS "laeuftBis",
              w."createdAt" AS "angelegt"
       FROM kundenbereiche w
       LEFT JOIN "subscriptions" s ON s."workspaceId" = w."id"
       ORDER BY w."createdAt" DESC
       LIMIT $2`,
      [betreiber, GRENZE],
    )) as BetriebBereich[];

    return { zahlen, konten, bereiche };
  }

  async konto(
    betreiberId: string,
    kontoId: string,
  ): Promise<BetriebKontoDetail> {
    await this.pruefeBetreiber(betreiberId);

    const [grund] = (await this.dataSource.query(
      `SELECT u."id", u."email",
              trim(concat_ws(' ', u."firstName", u."lastName")) AS "name",
              u."emailVerifiedAt" IS NOT NULL AS "bestaetigt",
              u."totpEnabledAt" IS NOT NULL AS "zweiFaktor",
              u."zuletztGesehenAt" AS "zuletztGesehen",
              u."createdAt" AS "angelegt"
       FROM "users" u WHERE u."id" = $1`,
      [kontoId],
    )) as Omit<
      BetriebKontoDetail,
      'anmeldungen' | 'anmeldungen30' | 'nutzung' | 'tage' | 'aenderungen'
    >[];

    if (grund === undefined) {
      throw new NotFoundException('Dieses Konto gibt es nicht.');
    }

    const anmeldungen = (await this.dataSource.query(
      `SELECT r."createdAt" AS "wann" FROM "refresh_tokens" r
       WHERE r."userId" = $1
         AND NOT EXISTS (SELECT 1 FROM "refresh_tokens" v WHERE v."replacedById" = r."id")
       ORDER BY r."createdAt" DESC LIMIT 15`,
      [kontoId],
    )) as { wann: Date }[];

    const [{ anzahl: anmeldungen30 }] = (await this.dataSource.query(
      `SELECT count(*)::int AS "anzahl" FROM "refresh_tokens" r
       WHERE r."userId" = $1 AND r."createdAt" > now() - interval '30 days'
         AND NOT EXISTS (SELECT 1 FROM "refresh_tokens" v WHERE v."replacedById" = r."id")`,
      [kontoId],
    )) as { anzahl: number }[];

    const nutzung = (await this.dataSource.query(
      `SELECT "bereich",
              coalesce(sum("anzahl") FILTER (WHERE "art" = 'ansehen'), 0)::int AS "angesehen",
              coalesce(sum("anzahl") FILTER (WHERE "art" = 'aendern'), 0)::int AS "geaendert",
              count(DISTINCT "tag")::int AS "tage",
              max("tag")::text AS "zuletzt"
       FROM "nutzung" WHERE "userId" = $1
       GROUP BY "bereich"
       ORDER BY sum("anzahl") DESC`,
      [kontoId],
    )) as BetriebNutzung[];

    const tage = (await this.dataSource.query(
      `SELECT "tag"::text AS "tag", sum("anzahl")::int AS "anzahl"
       FROM "nutzung" WHERE "userId" = $1 AND "tag" > current_date - 30
       GROUP BY "tag" ORDER BY "tag"`,
      [kontoId],
    )) as BetriebTag[];

    const aenderungen = (await this.dataSource.query(
      `SELECT a."action" AS "aktion", a."entityType" AS "art", w."name" AS "bereich", a."createdAt" AS "wann"
       FROM "audit_log" a JOIN "workspaces" w ON w."id" = a."workspaceId"
       WHERE a."actorId" = $1
       ORDER BY a."createdAt" DESC LIMIT 25`,
      [kontoId],
    )) as BetriebAenderung[];

    return {
      ...grund,
      anmeldungen: anmeldungen.map((a) => a.wann),
      anmeldungen30,
      nutzung,
      tage,
      aenderungen,
    };
  }
}
