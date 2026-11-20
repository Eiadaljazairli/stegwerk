import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { AppointmentReminderService } from './appointment-reminder.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const EVERY_MS = 5 * 60 * 1000;

@Injectable()
export class AppointmentReminderScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AppointmentReminderScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly reminders: AppointmentReminderService) {}

  onModuleInit(): void {
    einplanen('termin-erinnerung', EVERY_MS);
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      const report = await ueberwacht('termin-erinnerung', EVERY_MS, () =>
        this.reminders.run(),
      );

      if (report.sent > 0 || report.failed > 0) {
        this.logger.log(
          `Terminerinnerungen: ${report.sent} verschickt, ${report.expired} verfallen, ${report.failed} fehlgeschlagen`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Terminerinnerung fehlgeschlagen',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
