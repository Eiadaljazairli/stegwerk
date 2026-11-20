import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';
import { BuchhaltungService } from './buchhaltung.service';

const SCHLAG_MS = 10_000;

const RUNDE_MS = 60_000;

const STUENDLICH_MS = 60 * 60_000;

@Injectable()
export class BuchhaltungScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuchhaltungScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private letzteRunde = 0;
  private letzteStunde = 0;

  constructor(private readonly dienst: BuchhaltungService) {}

  onModuleInit(): void {
    einplanen('buchhaltung', RUNDE_MS);
    this.timer = setInterval(() => void this.schlag(), SCHLAG_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async schlag(jetzt = new Date()): Promise<void> {
    const faellig = jetzt.getTime() - this.letzteRunde >= RUNDE_MS;

    if (!this.dienst.angestossen && !faellig) {
      return;
    }

    if (faellig) {
      this.letzteRunde = jetzt.getTime();
    }

    try {
      await ueberwacht('buchhaltung', RUNDE_MS, async () => {
        if (jetzt.getTime() - this.letzteStunde >= STUENDLICH_MS) {
          this.letzteStunde = jetzt.getTime();
          await this.dienst.anmeldungPruefen(jetzt);
          await this.dienst.zahlungenAbgleichen(jetzt);
        }

        return this.dienst.verarbeiten(jetzt);
      });
    } catch (fehler) {
      this.logger.error(
        'Buchhaltung fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    }
  }
}
