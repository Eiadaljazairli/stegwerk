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
import { verlaengerungMail } from '../mail/templates';
import { BillingService } from './billing.service';
import { type BillingPlan, PLANS } from './plans';
import { StripeService } from './stripe.service';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;

export const VERLAENGERUNG_HINWEIS_TAGE = 30;

const ABGLEICH_JE_LAUF = 50;

const datum = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

@Injectable()
export class VerlaengerungScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerlaengerungScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly billing: BillingService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    einplanen('verlaengerung-hinweis', STUNDE_MS);
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
      const gesendet = await ueberwacht(
        'verlaengerung-hinweis',
        STUNDE_MS,
        () => this.erinnern(),
      );

      if (gesendet > 0) {
        this.logger.log(
          `Verlängerung: ${String(gesendet)} Hinweise verschickt`,
        );
      }
    } catch (fehler) {
      this.logger.error(
        'Hinweis zur Verlängerung fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    }
  }

  private async intervalleNachholen(): Promise<void> {
    if (!this.stripe.isConfigured) {
      return;
    }

    const offen = (await this.dataSource.query(
      `SELECT "stripeSubscriptionId" FROM "subscriptions"
        WHERE "abrechnungsIntervall" IS NULL
          AND "stripeSubscriptionId" IS NOT NULL
          AND "status" IN ('active', 'trialing', 'past_due')
        ORDER BY "currentPeriodEnd" ASC NULLS LAST
        LIMIT $1`,
      [ABGLEICH_JE_LAUF],
    )) as { stripeSubscriptionId: string }[];

    for (const abo of offen) {
      await this.stripe.abgleichen(abo.stripeSubscriptionId);
    }
  }

  async erinnern(jetzt = new Date()): Promise<number> {
    if (!this.billing.verkauftPlaetze) {
      return 0;
    }

    await this.intervalleNachholen();

    const bis = new Date(jetzt.getTime() + VERLAENGERUNG_HINWEIS_TAGE * TAG_MS);
    const faellig = (await this.dataSource.query(
      `UPDATE "subscriptions"
          SET "verlaengerungHinweisFuer" = "currentPeriodEnd"
        WHERE "status" = 'active'
          AND "abrechnungsIntervall" = 'year'
          AND "cancelAtPeriodEnd" = false
          AND "currentPeriodEnd" > $1 AND "currentPeriodEnd" <= $2
          AND "verlaengerungHinweisFuer" IS DISTINCT FROM "currentPeriodEnd"
        RETURNING "workspaceId", "currentPeriodEnd", "plan", "seats"`,
      [jetzt, bis],
    )) as [
      {
        workspaceId: string;
        currentPeriodEnd: Date;
        plan: BillingPlan;
        seats: number;
      }[],
      number,
    ];
    const url = `${this.config.getOrThrow<string>('webOrigin')}/abrechnung`;
    let gesendet = 0;

    for (const abo of faellig[0]) {
      const inhaber = (await this.dataSource.query(
        `SELECT u."email", w."name" FROM "memberships" m
           JOIN "users" u ON u."id" = m."userId"
           JOIN "workspaces" w ON w."id" = m."workspaceId"
          WHERE m."workspaceId" = $1 AND m."role" = 'owner'
            AND u."email" NOT LIKE '%@stegwerk.invalid'`,
        [abo.workspaceId],
      )) as { email: string; name: string }[];
      const plan = PLANS[abo.plan] as (typeof PLANS)[BillingPlan] | undefined;
      const proPlatz = plan?.yearlyPricePerSeat ?? 0;
      const eingabe = {
        datum: datum.format(new Date(abo.currentPeriodEnd)),
        tarif: plan?.name ?? String(abo.plan),
        plaetze: abo.seats,
        betragNetto:
          proPlatz > 0 ? euro.format((proPlatz * abo.seats) / 100) : null,
      };

      for (const person of inhaber) {
        if (
          await this.mail.send(
            verlaengerungMail(person.email, person.name, eingabe, url),
          )
        ) {
          gesendet += 1;
        }
      }
    }

    return gesendet;
  }
}
