import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { RetentionService } from './retention.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const HOUR_MS = 60 * 60 * 1000;
const EVERY_DAY_MS = 24 * HOUR_MS;

@Injectable()
export class RetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly retentionService: RetentionService) {}

  onModuleInit(): void {
    if (!this.retentionService.enabled) {
      this.logger.log(
        'Retention sweep off — set RETENTION_SWEEP_ENABLED=true to delete data after the retention period',
      );
      einplanen('aufbewahrung-bereiche', EVERY_DAY_MS, false);

      return;
    }

    this.logger.warn('Retention sweep on — data will be deleted on schedule');

    einplanen('aufbewahrung-bereiche', EVERY_DAY_MS);
    this.timer = setInterval(() => void this.run(), EVERY_DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      const report = await ueberwacht(
        'aufbewahrung-bereiche',
        EVERY_DAY_MS,
        () => this.retentionService.sweep({ dryRun: false }),
      );

      if (report.warned > 0 || report.deleted > 0) {
        this.logger.warn(
          `Retention sweep: ${report.warned} warned, ${report.deleted} erased`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Retention sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
