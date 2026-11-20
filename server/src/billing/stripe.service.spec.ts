import { BillingPlan, SubscriptionStatus } from './plans';
import { StripeService } from './stripe.service';

const PREISE: Record<string, string> = {
  'stripePrice.starter.month': 'price_starter_m',
  'stripePrice.professional.year': 'price_pro_y',
};

const aufbau = () => {
  const gespeichert: Record<string, unknown>[] = [];
  const abo = { plan: BillingPlan.TRIAL, seats: 1 } as Record<string, unknown>;

  const service = new StripeService(
    { get: (key: string) => PREISE[key] } as never,
    {
      ensureSubscription: () => Promise.resolve(abo),
      save: (wert: Record<string, unknown>) => {
        gespeichert.push({ ...wert });

        return Promise.resolve(wert);
      },
    } as never,
  );

  return { service, gespeichert };
};

const abonnement = (preis: string, plan: string) =>
  ({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    metadata: { workspaceId: 'ws-1', plan },
    items: { data: [{ quantity: 3, price: { id: preis } }] },
  }) as never;

describe('StripeService', () => {
  it('kennt den Plan zu den eigenen Preisen', () => {
    const { service } = aufbau();

    expect(service.planForPrice('price_starter_m')).toBe(BillingPlan.STARTER);
    expect(service.planForPrice('price_pro_y')).toBe(BillingPlan.PROFESSIONAL);
    expect(service.planForPrice('price_fremd')).toBeNull();
  });

  it('nimmt den Plan aus dem Preis, auch wenn die Metadaten anderes sagen', async () => {
    const { service, gespeichert } = aufbau();

    await service.applySubscriptionEvent(
      abonnement('price_starter_m', 'professional'),
    );

    expect(gespeichert[0]).toMatchObject({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.ACTIVE,
      seats: 3,
    });
  });

  it('übernimmt das Intervall aus dem Preis', async () => {
    const { service, gespeichert } = aufbau();
    const jahr = abonnement('price_pro_y', 'professional') as unknown as {
      items: { data: { price: Record<string, unknown> }[] };
    };

    jahr.items.data[0].price.recurring = { interval: 'year' };
    await service.applySubscriptionEvent(jahr as never);

    expect(gespeichert[0]).toMatchObject({ abrechnungsIntervall: 'year' });
  });

  it('ändert den Plan nicht bei einem fremden Preis', async () => {
    const { service, gespeichert } = aufbau();

    await service.applySubscriptionEvent(
      abonnement('price_fremd', 'professional'),
    );

    expect(gespeichert[0]).toMatchObject({ plan: BillingPlan.TRIAL });
  });

  it('gleicht ein bestehendes Abo bei Stripe ab und übernimmt das Intervall', async () => {
    const { service, gespeichert } = aufbau();
    const jahr = abonnement('price_pro_y', 'professional') as unknown as {
      items: { data: { price: Record<string, unknown> }[] };
    };

    jahr.items.data[0].price.recurring = { interval: 'year' };
    const abgerufen: string[] = [];

    (service as unknown as { stripe: unknown }).stripe = {
      subscriptions: {
        retrieve: (id: string) => {
          abgerufen.push(id);

          return id === 'sub_1'
            ? Promise.resolve(jahr)
            : Promise.reject(new Error('No such subscription'));
        },
      },
    };

    expect(await service.abgleichen('sub_1')).toBe(true);
    expect(abgerufen).toEqual(['sub_1']);
    expect(gespeichert[0]).toMatchObject({ abrechnungsIntervall: 'year' });

    expect(await service.abgleichen('sub_weg')).toBe(false);
    expect(gespeichert).toHaveLength(1);
  });

  it('gleicht ohne Zahlungsabwicklung nichts ab', async () => {
    const { service, gespeichert } = aufbau();

    expect(await service.abgleichen('sub_1')).toBe(false);
    expect(gespeichert).toHaveLength(0);
  });
});
