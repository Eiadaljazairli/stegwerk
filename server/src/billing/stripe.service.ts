import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { BillingService } from './billing.service';
import { BillingPlan, SubscriptionStatus } from './plans';

export type BillingInterval = 'month' | 'year';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {
    const apiKey = this.configService.get<string>('stripeSecretKey');

    this.stripe =
      apiKey === undefined || apiKey === '' ? null : new Stripe(apiKey);
  }

  get isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireStripe(): Stripe {
    if (this.stripe === null) {
      throw new ServiceUnavailableException(
        'Für diese Installation ist keine Zahlungsabwicklung eingerichtet.',
      );
    }

    return this.stripe;
  }

  private priceIdFor(plan: BillingPlan, interval: BillingInterval): string {
    const key = `stripePrice.${plan}.${interval}`;
    const priceId = this.configService.get<string>(key);

    if (priceId === undefined || priceId === '') {
      throw new ServiceUnavailableException(
        `Für ${plan}/${interval} ist bei Stripe kein Preis hinterlegt.`,
      );
    }

    return priceId;
  }

  planForPrice(priceId: string | undefined): BillingPlan | null {
    if (priceId === undefined) {
      return null;
    }

    for (const plan of Object.values(BillingPlan)) {
      for (const interval of ['month', 'year']) {
        if (
          this.configService.get<string>(`stripePrice.${plan}.${interval}`) ===
          priceId
        ) {
          return plan;
        }
      }
    }

    return null;
  }

  async createCheckoutSession(
    workspaceId: string,
    email: string,
    plan: BillingPlan,
    interval: BillingInterval,
    seats: number,
  ): Promise<string> {
    const stripe = this.requireStripe();
    const subscription =
      await this.billingService.ensureSubscription(workspaceId);
    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: subscription.stripeCustomerId ?? undefined,
      customer_email:
        subscription.stripeCustomerId === null ? email : undefined,
      line_items: [{ price: this.priceIdFor(plan, interval), quantity: seats }],
      metadata: { workspaceId, plan },
      subscription_data: { metadata: { workspaceId, plan } },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      success_url: `${webOrigin}/abrechnung?erfolg=1`,
      cancel_url: `${webOrigin}/abrechnung`,
    });

    if (session.url === null) {
      throw new ServiceUnavailableException(
        'Stripe hat keine Adresse für die Kasse zurückgegeben.',
      );
    }

    return session.url;
  }

  async createPortalSession(workspaceId: string): Promise<string> {
    const stripe = this.requireStripe();
    const subscription =
      await this.billingService.ensureSubscription(workspaceId);

    if (subscription.stripeCustomerId === null) {
      throw new ServiceUnavailableException(
        'Für diesen Arbeitsbereich gibt es noch kein Abrechnungskonto.',
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${this.configService.getOrThrow<string>('webOrigin')}/abrechnung`,
    });

    return session.url;
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const stripe = this.requireStripe();
    const secret = this.configService.get<string>('stripeWebhookSecret');

    if (secret === undefined || secret === '') {
      throw new ServiceUnavailableException(
        'Es ist kein Stripe-Webhook-Geheimnis hinterlegt.',
      );
    }

    return stripe.webhooks.constructEvent(payload, signature, secret);
  }

  private mapStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      default:
        return SubscriptionStatus.CANCELED;
    }
  }

  async applySubscriptionEvent(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const workspaceId = stripeSubscription.metadata?.workspaceId;

    if (typeof workspaceId !== 'string') {
      this.logger.warn(
        `Stripe subscription ${stripeSubscription.id} has no workspaceId metadata; ignoring`,
      );

      return;
    }

    const subscription =
      await this.billingService.ensureSubscription(workspaceId);
    const item = stripeSubscription.items.data[0];

    subscription.status = this.mapStatus(stripeSubscription.status);
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripeCustomerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer.id;
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    if (item !== undefined) {
      subscription.seats = item.quantity ?? subscription.seats;
    }

    const intervall = item?.price?.recurring?.interval;

    if (intervall === 'month' || intervall === 'year') {
      subscription.abrechnungsIntervall = intervall;
    }

    subscription.currentPeriodEnd = new Date(
      stripeSubscription.current_period_end * 1000,
    );

    const plan = this.planForPrice(item?.price?.id);

    if (plan === null) {
      this.logger.warn(
        `Stripe subscription ${stripeSubscription.id}: price ${item?.price?.id ?? '(none)'} is not one of ours; plan unchanged`,
      );
    } else {
      subscription.plan = plan;
    }

    await this.billingService.save(subscription);

    this.logger.log(
      `Workspace ${workspaceId}: ${subscription.plan}/${subscription.status}, ${subscription.seats} seats`,
    );
  }

  private async aktuellerStand(
    ausEreignis: Stripe.Subscription,
  ): Promise<Stripe.Subscription> {
    if (this.stripe === null) {
      return ausEreignis;
    }

    try {
      return await this.stripe.subscriptions.retrieve(ausEreignis.id);
    } catch (error) {
      this.logger.warn(
        `Stripe subscription ${ausEreignis.id} could not be re-read: ${error instanceof Error ? error.message : String(error)}`,
      );

      return ausEreignis;
    }
  }

  async abgleichen(stripeSubscriptionId: string): Promise<boolean> {
    if (this.stripe === null) {
      return false;
    }

    let stand: Stripe.Subscription;

    try {
      stand = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (error) {
      this.logger.warn(
        `Stripe subscription ${stripeSubscriptionId} could not be read for reconciliation: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }

    await this.applySubscriptionEvent(stand);

    return true;
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applySubscriptionEvent(
          await this.aktuellerStand(event.data.object as Stripe.Subscription),
        );
        break;

      default:
        this.logger.debug(`Ignoring Stripe event ${event.type}`);
    }
  }
}
