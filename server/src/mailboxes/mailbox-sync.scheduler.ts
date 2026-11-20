import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Raw, Repository } from 'typeorm';

import { BillingService } from '../billing/billing.service';
import { MailService } from '../mail/mail.service';
import { abrufStehtMail } from '../mail/templates';
import {
  ERSTER_ABSTAND_MS,
  mailFaellig,
  wiederFaellig,
  wiederFaelligSql,
} from './abruf-fehler';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService } from './mailboxes.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const MINUTE_MS = 60 * 1000;

const ALLE_MS = 10 * MINUTE_MS;

const JE_RUNDE = 50;

@Injectable()
export class MailboxSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxSyncScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private laeuft = false;

  constructor(
    @InjectRepository(MailboxEntity)
    private readonly mailboxes: Repository<MailboxEntity>,
    private readonly service: MailboxesService,
    private readonly billing: BillingService,
    @Optional() private readonly mail?: MailService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    einplanen('postfach-abruf', ALLE_MS);
    this.timer = setInterval(
      () => void ueberwacht('postfach-abruf', ALLE_MS, () => this.runde()),
      ALLE_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async runde(jetzt = new Date()): Promise<number> {
    if (this.laeuft) {
      return 0;
    }

    this.laeuft = true;
    let abgeholt = 0;

    try {
      const faellig = new Date(jetzt.getTime() - ALLE_MS + MINUTE_MS);
      const fruehestens = new Date(
        jetzt.getTime() - ERSTER_ABSTAND_MS + MINUTE_MS,
      );
      const gefunden = await this.mailboxes.find({
        where: [
          { active: true, lastSyncedAt: IsNull() },
          {
            active: true,
            lastError: IsNull(),
            lastSyncedAt: LessThan(faellig),
          },
          {
            active: true,
            lastError: Not(IsNull()),
            lastSyncedAt: Raw(
              (spalte) =>
                `${spalte} < :fruehestens AND ${wiederFaelligSql(spalte).sql}`,
              {
                fruehestens,
                wfJetzt: jetzt,
                ...wiederFaelligSql('').parameter,
              },
            ),
          },
        ],
        order: { lastSyncedAt: { direction: 'ASC', nulls: 'FIRST' } },
        take: JE_RUNDE * 4,
      });
      const kandidaten = gefunden
        .filter(
          (postfach) =>
            postfach.lastError === null ||
            postfach.lastError === undefined ||
            wiederFaellig(postfach, postfach.lastSyncedAt, jetzt),
        )
        .slice(0, JE_RUNDE);

      for (const postfach of kandidaten) {
        try {
          await this.billing.assertCanWrite(postfach.workspaceId);
          await this.service.syncPostfach(postfach);
          abgeholt += 1;
        } catch (fehler) {
          this.logger.warn(
            `Postfach ${postfach.id} nicht abgeholt: ${
              fehler instanceof Error ? fehler.message : String(fehler)
            }`,
          );
        }
      }

      await this.stillstandMelden(jetzt);
    } catch (fehler) {
      this.logger.error(
        'Postfach-Abruf fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    } finally {
      this.laeuft = false;
    }

    return abgeholt;
  }

  async stillstandMelden(jetzt = new Date()): Promise<number> {
    if (this.mail === undefined) {
      return 0;
    }

    const gestoert = await this.mailboxes.find({
      where: {
        active: true,
        getrenntAm: IsNull(),
        lastError: Not(IsNull()),
        fehlerMailAm: IsNull(),
        fehlerSeit: LessThan(new Date(jetzt.getTime() - 24 * 60 * MINUTE_MS)),
      },
      relations: { user: true },
      take: JE_RUNDE,
    });
    let gemeldet = 0;

    for (const postfach of gestoert) {
      if (!mailFaellig(postfach, jetzt) || postfach.user === undefined) {
        continue;
      }

      await this.mailboxes.update(postfach.id, { fehlerMailAm: jetzt });

      const herkunft =
        this.config?.get<string>('webOrigin') ?? 'http://localhost:5273';

      await this.mail.send(
        abrufStehtMail(
          postfach.user.email,
          'Postfach',
          postfach.username,
          postfach.lastError ?? '',
          `${herkunft}/postfach`,
          postfach.fehlerArt,
        ),
      );
      gemeldet += 1;
    }

    return gemeldet;
  }
}
