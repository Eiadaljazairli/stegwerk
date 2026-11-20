import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { SerienmailsService } from './serienmails.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const ALLE_MS = 60 * 1000;

@Injectable()
export class SerienmailsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerienmailsScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private laeuft = false;

  constructor(private readonly service: SerienmailsService) {}

  onModuleInit(): void {
    void this.service
      .haengendeAufloesen(new Date(), true)
      .catch((fehler) =>
        this.logger.error(
          'Serienmail-Aufräumen fehlgeschlagen',
          fehler instanceof Error ? fehler.stack : String(fehler),
        ),
      );
    einplanen('serienmails', ALLE_MS);
    this.timer = setInterval(() => void this.tick(), ALLE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (this.laeuft) {
      return;
    }

    this.laeuft = true;

    try {
      await ueberwacht('serienmails', ALLE_MS, () => this.service.runde());
    } catch (fehler) {
      this.logger.error(
        'Serienmail-Versand fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    } finally {
      this.laeuft = false;
    }
  }
}
