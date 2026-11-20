import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { PapierkorbService } from './papierkorb.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

@Injectable()
export class PapierkorbScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PapierkorbScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly papierkorb: PapierkorbService) {}

  onModuleInit(): void {
    einplanen('papierkorb', 60 * 60 * 1000);
    this.timer = setInterval(() => void this.run(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      const weg = await ueberwacht('papierkorb', 60 * 60 * 1000, () =>
        this.papierkorb.aufraeumen(),
      );

      if (weg > 0) {
        this.logger.log(`Papierkorb: ${weg} endgültig gelöscht`);
      }
    } catch (fehler) {
      this.logger.error(
        'Papierkorb aufräumen fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    }
  }
}
