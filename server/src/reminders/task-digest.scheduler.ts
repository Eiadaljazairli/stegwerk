import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { TaskDigestService } from './task-digest.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class TaskDigestScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskDigestScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly digest: TaskDigestService) {}

  onModuleInit(): void {
    einplanen('aufgaben-erinnerung', HOUR_MS);
    this.timer = setInterval(() => void this.run(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      const report = await ueberwacht('aufgaben-erinnerung', HOUR_MS, () =>
        this.digest.run(),
      );

      if (report.sent > 0) {
        this.logger.log(`Aufgabenerinnerung: ${report.sent} verschickt`);
      }
    } catch (error) {
      this.logger.error(
        'Aufgabenerinnerung fehlgeschlagen',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
