import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { berlinDate } from '../calendar/berlin-time';
import { InvoiceSeriesService } from './invoice-series.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const EVERY_MS = 60 * 60 * 1000;

@Injectable()
export class InvoiceSeriesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoiceSeriesScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private start: NodeJS.Timeout | undefined;

  constructor(private readonly series: InvoiceSeriesService) {}

  onModuleInit(): void {
    einplanen('serienrechnungen', EVERY_MS);
    this.start = setTimeout(() => void this.run(), 60 * 1000);
    this.start.unref();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.start !== undefined) {
      clearTimeout(this.start);
    }

    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async run(): Promise<void> {
    try {
      const lauf = await ueberwacht('serienrechnungen', EVERY_MS, () =>
        this.series.runDue(berlinDate(new Date())),
      );

      if (lauf.erstellt > 0 || lauf.fehlgeschlagen > 0) {
        this.logger.log(
          `Serienrechnungen: ${lauf.erstellt} Entwürfe, ${lauf.fehlgeschlagen} fehlgeschlagen`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Serienrechnungen fehlgeschlagen',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
