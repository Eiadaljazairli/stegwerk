import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { einplanen, ueberwacht } from './laeufe.service';

const ALLE_MS = 6 * 60 * 60 * 1000;

export const MINDEST_MONATE = { aenderungen: 6, sicherheit: 3 } as const;
export const STANDARD_MONATE = { aenderungen: 24, sicherheit: 12 } as const;

const monate = (wert: unknown, standard: number, mindestens: number) => {
  const zahl = Number(wert);

  return Number.isFinite(zahl) && zahl > 0
    ? Math.max(Math.floor(zahl), mindestens)
    : standard;
};

export const fristen = (roh?: {
  aenderungenMonate?: unknown;
  sicherheitMonate?: unknown;
}) => ({
  aenderungen: monate(
    roh?.aenderungenMonate,
    STANDARD_MONATE.aenderungen,
    MINDEST_MONATE.aenderungen,
  ),
  sicherheit: monate(
    roh?.sicherheitMonate,
    STANDARD_MONATE.sicherheit,
    MINDEST_MONATE.sicherheit,
  ),
});

const vor = (jetzt: Date, monateZurueck: number): Date => {
  const grenze = new Date(jetzt);

  grenze.setUTCMonth(grenze.getUTCMonth() - monateZurueck);

  return grenze;
};

export type AufbewahrungsBericht = {
  aenderungenGeloescht: number;
  anlagenGekuerzt: number;
  sicherheitGeloescht: number;
};

@Injectable()
export class ProtokollAufbewahrung implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProtokollAufbewahrung.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  get monate() {
    return fristen(
      this.config.get<{ aenderungenMonate: number; sicherheitMonate: number }>(
        'protokolle',
      ),
    );
  }

  onModuleInit(): void {
    einplanen('protokolle-aufraeumen', ALLE_MS);
    this.timer = setInterval(() => void this.lauf(), ALLE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async lauf(): Promise<void> {
    try {
      const bericht = await ueberwacht('protokolle-aufraeumen', ALLE_MS, () =>
        this.aufraeumen(),
      );

      if (
        bericht.aenderungenGeloescht +
          bericht.anlagenGekuerzt +
          bericht.sicherheitGeloescht >
        0
      ) {
        this.logger.log(
          `Protokolle: ${String(bericht.aenderungenGeloescht)} Änderungen, ${String(bericht.sicherheitGeloescht)} Sicherheitseinträge gelöscht, ${String(bericht.anlagenGekuerzt)} gekürzt`,
        );
      }
    } catch (fehler) {
      this.logger.error(
        'Protokolle aufräumen fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    }
  }

  async aufraeumen(jetzt = new Date()): Promise<AufbewahrungsBericht> {
    const frist = this.monate;
    const aenderungenBis = vor(jetzt, frist.aenderungen);
    const sicherheitBis = vor(jetzt, frist.sicherheit);

    const [, aenderungenGeloescht] = (await this.dataSource.query(
      `DELETE FROM "audit_log" WHERE "createdAt" < $1 AND "action" <> 'created'`,
      [aenderungenBis],
    )) as [unknown, number];
    const [, anlagenGekuerzt] = (await this.dataSource.query(
      `UPDATE "audit_log" SET "changes" = NULL
        WHERE "createdAt" < $1 AND "action" = 'created' AND "changes" IS NOT NULL`,
      [aenderungenBis],
    )) as [unknown, number];
    const [, sicherheitGeloescht] = (await this.dataSource.query(
      `DELETE FROM "sicherheits_ereignisse" WHERE "createdAt" < $1`,
      [sicherheitBis],
    )) as [unknown, number];

    return { aenderungenGeloescht, anlagenGekuerzt, sicherheitGeloescht };
  }
}
