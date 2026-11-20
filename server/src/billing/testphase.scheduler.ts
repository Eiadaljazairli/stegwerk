import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { MailService } from '../mail/mail.service';
import { testphaseEndetMail } from '../mail/templates';
import { BillingService } from './billing.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;

export const HINWEIS_TAGE = 3;

@Injectable()
export class TestphaseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TestphaseScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly billing: BillingService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    einplanen('testphase-hinweis', STUNDE_MS);
    this.timer = setInterval(() => void this.run(), STUNDE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    try {
      const gesendet = await ueberwacht('testphase-hinweis', STUNDE_MS, () =>
        this.erinnern(),
      );

      if (gesendet > 0) {
        this.logger.log(`Testphase: ${String(gesendet)} Hinweise verschickt`);
      }
    } catch (fehler) {
      this.logger.error(
        'Hinweis zur Testphase fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    }
  }

  async erinnern(jetzt = new Date()): Promise<number> {
    if (!this.billing.verkauftPlaetze) {
      return 0;
    }

    const bis = new Date(jetzt.getTime() + HINWEIS_TAGE * TAG_MS);
    const faellig = (await this.dataSource.query(
      `UPDATE "subscriptions" SET "testphaseHinweisAm" = $1
        WHERE "status" = 'trialing'
          AND "testphaseHinweisAm" IS NULL
          AND "trialEndsAt" > $1 AND "trialEndsAt" <= $2
        RETURNING "workspaceId", "trialEndsAt"`,
      [jetzt, bis],
    )) as [{ workspaceId: string; trialEndsAt: Date }[], number];
    const url = `${this.config.getOrThrow<string>('webOrigin')}/abrechnung`;
    let gesendet = 0;

    for (const { workspaceId, trialEndsAt } of faellig[0]) {
      const inhaber = (await this.dataSource.query(
        `SELECT u."email", w."name" FROM "memberships" m
           JOIN "users" u ON u."id" = m."userId"
           JOIN "workspaces" w ON w."id" = m."workspaceId"
          WHERE m."workspaceId" = $1 AND m."role" = 'owner'
            AND u."email" NOT LIKE '%@stegwerk.invalid'`,
        [workspaceId],
      )) as { email: string; name: string }[];
      const tage = Math.max(
        1,
        Math.ceil((new Date(trialEndsAt).getTime() - jetzt.getTime()) / TAG_MS),
      );

      for (const person of inhaber) {
        if (
          await this.mail.send(
            testphaseEndetMail(person.email, person.name, tage, url),
          )
        ) {
          gesendet += 1;
        }
      }
    }

    return gesendet;
  }
}
