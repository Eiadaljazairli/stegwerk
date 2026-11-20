import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import { berlinDate } from '../calendar/berlin-time';

export const NUTZUNG_TAGE = 90;

const ALLE_MS = 60_000;

const UEBERGEHEN = new Set([
  'AuthResolver',
  'BetriebResolver',
  'BillingResolver',
  'LegalResolver',
  'PrivacyResolver',
  'HealthController',
]);

const NUR_AENDERN = new Set([
  'DealStagesResolver',
  'SavedViewsResolver',
  'CustomFieldsResolver',
  'WorkspacesResolver',
]);

const BEREICHE: Record<string, string> = {
  CompaniesResolver: 'Firmen',
  ContactsResolver: 'Kontakte',
  DealsResolver: 'Geschäfte',
  DealStagesResolver: 'Phasen',
  TasksResolver: 'Aufgaben',
  NotesResolver: 'Notizen',
  AppointmentsResolver: 'Kalender',
  AppointmentAttendeeResolver: 'Kalender',
  AppointmentDocumentsController: 'Kalender',
  CalendarFeedResolver: 'Kalender',
  QuotesResolver: 'Angebote',
  QuoteDocumentsController: 'Angebote',
  ProductsResolver: 'Artikel',
  InvoicesResolver: 'Rechnungen',
  InvoiceDocumentsController: 'Rechnungen',
  InvoiceSeriesResolver: 'Rechnungen',
  InvoiceSeriesFieldResolver: 'Rechnungen',
  RemindersResolver: 'Offene Posten',
  LetterheadsResolver: 'Briefkopf',
  LetterheadLogoController: 'Briefkopf',
  FavoritenResolver: 'Favoriten',
  MailboxesResolver: 'Postfach',
  MailTemplatesResolver: 'Postfach',
  CustomFieldsResolver: 'Felder',
  WebFormsResolver: 'Webformular',
  WebhooksResolver: 'Webhooks',
  ApiKeysResolver: 'Schnittstelle',
  ImportResolver: 'Import',
  ExportController: 'Export',
  AttachmentsResolver: 'Anhänge',
  AttachmentsController: 'Anhänge',
  AuditResolver: 'Protokoll',
  SavedViewsResolver: 'Ansichten',
  InvitationsResolver: 'Team',
  RolesResolver: 'Team',
  WorkspacesResolver: 'Team',
  TwoFactorResolver: 'Sicherheit',
  RetentionResolver: 'Daten',
};

export const bereichFuer = (klasse: string, aendern = false): string | null =>
  UEBERGEHEN.has(klasse) || (NUR_AENDERN.has(klasse) && !aendern)
    ? null
    : (BEREICHE[klasse] ?? klasse.replace(/(Resolver|Controller)$/u, ''));

@Injectable()
export class NutzungService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NutzungService.name);
  private zaehler = new Map<string, number>();
  private gesehen = new Map<string, Date>();
  private uhr: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.uhr = setInterval(() => void this.schreiben(), ALLE_MS);
    this.uhr.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.uhr !== null) {
      clearInterval(this.uhr);
    }

    await this.schreiben();
  }

  merke(userId: string, bereich: string | null, aendern: boolean): void {
    this.gesehen.set(userId, new Date());

    if (bereich === null) {
      return;
    }

    const schluessel = [
      userId,
      berlinDate(new Date()),
      bereich,
      aendern ? 'aendern' : 'ansehen',
    ].join('|');

    this.zaehler.set(schluessel, (this.zaehler.get(schluessel) ?? 0) + 1);
  }

  async schreiben(): Promise<void> {
    const zaehler = this.zaehler;
    const gesehen = this.gesehen;

    this.zaehler = new Map();
    this.gesehen = new Map();

    try {
      for (const [userId, wann] of gesehen) {
        await this.dataSource.query(
          `UPDATE "users" SET "zuletztGesehenAt" = $2
           WHERE "id" = $1 AND ("zuletztGesehenAt" IS NULL OR "zuletztGesehenAt" < $2)`,
          [userId, wann],
        );
      }

      for (const [schluessel, anzahl] of zaehler) {
        const [userId, tag, bereich, art] = schluessel.split('|');

        await this.dataSource.query(
          `INSERT INTO "nutzung" ("userId", "tag", "bereich", "art", "anzahl")
           SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = $1)
           ON CONFLICT ("userId", "tag", "bereich", "art")
           DO UPDATE SET "anzahl" = "nutzung"."anzahl" + EXCLUDED."anzahl"`,
          [userId, tag, bereich, art, anzahl],
        );
      }

      await this.dataSource.query(
        `DELETE FROM "nutzung" WHERE "tag" < current_date - $1::int`,
        [NUTZUNG_TAGE],
      );
    } catch (fehler) {
      this.logger.warn(`Nutzung nicht geschrieben: ${String(fehler)}`);
    }
  }
}
