import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { type Mail, type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BillingService } from './billing.service';
import { BillingPlan, SubscriptionStatus } from './plans';
import { type StripeService } from './stripe.service';
import { SubscriptionEntity } from './subscription.entity';
import { VerlaengerungScheduler } from './verlaengerung.scheduler';

const SUITE = 'verlaengerung';
const TAG_MS = 24 * 60 * 60 * 1000;

jest.setTimeout(60_000);

let dataSource: DataSource;
let gesendet: Mail[];
let nachgelesen: string[];

const stripeErsatz = (kasse: boolean) =>
  ({
    isConfigured: kasse,
    abgleichen: async (id: string) => {
      nachgelesen.push(id);
      await dataSource
        .getRepository(SubscriptionEntity)
        .update({ stripeSubscriptionId: id }, { abrechnungsIntervall: 'year' });

      return true;
    },
  }) as unknown as StripeService;

const konfiguration = (kasse: boolean) =>
  ({
    get: (schluessel: string) =>
      schluessel === 'stripeSecretKey' && kasse ? 'sk_test_probe' : undefined,
    getOrThrow: () => 'https://app.example',
  }) as unknown as ConfigService;

const planer = (kasse = true) =>
  new VerlaengerungScheduler(
    dataSource,
    new BillingService(
      dataSource.getRepository(SubscriptionEntity),
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(InvitationEntity),
      konfiguration(kasse),
    ),
    {
      send: (mail: Mail) => {
        gesendet.push(mail);

        return Promise.resolve(true);
      },
    } as unknown as MailService,
    konfiguration(kasse),
    stripeErsatz(kasse),
  );

const bereich = async (
  name: string,
  endeInTagen: number,
  abo: Partial<SubscriptionEntity> = {},
) => {
  const w = await dataSource
    .getRepository(WorkspaceEntity)
    .save({ name, slug: name.toLowerCase() });
  const nutzer = dataSource.getRepository(UserEntity);
  const mitglieder = dataSource.getRepository(MembershipEntity);

  for (const [mail, rolle] of [
    [`inhaber@${w.slug}.test`, MembershipRole.OWNER],
    [`mitglied@${w.slug}.test`, MembershipRole.MEMBER],
  ] as const) {
    const u = await nutzer.save({
      email: mail,
      passwordHash: 'x',
      firstName: 'A',
      lastName: 'B',
    });

    await mitglieder.save({ userId: u.id, workspaceId: w.id, role: rolle });
  }

  await dataSource.getRepository(SubscriptionEntity).save({
    workspaceId: w.id,
    plan: BillingPlan.STARTER,
    status: SubscriptionStatus.ACTIVE,
    seats: 4,
    abrechnungsIntervall: 'year',
    currentPeriodEnd: new Date(Date.now() + endeInTagen * TAG_MS),
    ...abo,
  });

  return w;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  gesendet = [];
  nachgelesen = [];
  await dataSource.query(
    'TRUNCATE TABLE subscriptions, memberships, users, workspaces CASCADE',
  );
});

it('schreibt den Inhabern eines Jahresabos 30 Tage vorher, genau einmal', async () => {
  await bereich('Bald', 20);
  await bereich('Spaeter', 45);
  await bereich('Monat', 10, { abrechnungsIntervall: 'month' });
  await bereich('Gekuendigt', 10, { cancelAtPeriodEnd: true });
  await bereich('Unbekannt', 10, { abrechnungsIntervall: null });

  expect(await planer().erinnern()).toBe(1);
  expect(gesendet.map((m) => m.to)).toEqual(['inhaber@bald.test']);
  expect(gesendet[0].subject).toMatch(/^Ihr Jahresabo verlängert sich am /u);
  expect(gesendet[0].text).toContain('4 Plätze');
  expect(gesendet[0].text).toContain('760,00');
  expect(gesendet[0].text).toContain('https://app.example/abrechnung');

  expect(await planer().erinnern()).toBe(0);
  expect(gesendet).toHaveLength(1);
});

it('meldet sich im nächsten Jahr wieder', async () => {
  const w = await bereich('Jaehrlich', 20);

  expect(await planer().erinnern()).toBe(1);

  const neuesEnde = new Date(Date.now() + 385 * TAG_MS);

  await dataSource
    .getRepository(SubscriptionEntity)
    .update({ workspaceId: w.id }, { currentPeriodEnd: neuesEnde });

  expect(await planer().erinnern()).toBe(0);
  expect(
    await planer().erinnern(new Date(neuesEnde.getTime() - 20 * TAG_MS)),
  ).toBe(1);
  expect(gesendet).toHaveLength(2);
});

it('schweigt, wo nichts verkauft wird', async () => {
  await bereich('Bald', 5);

  expect(await planer(false).erinnern()).toBe(0);
  expect(gesendet).toHaveLength(0);
});

it('schreibt nicht an fremde Bereiche', async () => {
  await bereich('Eigen', 5);
  await bereich('Fremd', 60);

  await planer().erinnern();

  expect(gesendet.map((m) => m.to)).toEqual(['inhaber@eigen.test']);
});

it('liest bestehende Abos ohne Intervall bei Stripe nach und erinnert dann', async () => {
  await bereich('Altkunde', 20, {
    abrechnungsIntervall: null,
    stripeSubscriptionId: 'sub_alt',
  });
  await bereich('Ohnestripe', 20, { abrechnungsIntervall: null });
  await bereich('Bekannt', 20, { stripeSubscriptionId: 'sub_bekannt' });

  expect(await planer().erinnern()).toBe(2);
  expect(nachgelesen).toEqual(['sub_alt']);
  expect(gesendet.map((m) => m.to).sort()).toEqual([
    'inhaber@altkunde.test',
    'inhaber@bekannt.test',
  ]);

  await planer().erinnern();
  expect(nachgelesen).toEqual(['sub_alt']);
});
