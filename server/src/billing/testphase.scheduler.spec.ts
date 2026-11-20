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
import { SubscriptionStatus } from './plans';
import { SubscriptionEntity } from './subscription.entity';
import { TestphaseScheduler } from './testphase.scheduler';

const SUITE = 'testphase';
const TAG_MS = 24 * 60 * 60 * 1000;

jest.setTimeout(60_000);

let dataSource: DataSource;
let gesendet: Mail[];

const konfiguration = (kasse: boolean) =>
  ({
    get: (schluessel: string) =>
      schluessel === 'stripeSecretKey' && kasse ? 'sk_test_probe' : undefined,
    getOrThrow: () => 'https://app.example',
  }) as unknown as ConfigService;

const planer = (kasse = true) =>
  new TestphaseScheduler(
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
  );

const bereich = async (name: string, endeInTagen: number) => {
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
    status: SubscriptionStatus.TRIALING,
    trialEndsAt: new Date(Date.now() + endeInTagen * TAG_MS),
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
  await dataSource.query(
    'TRUNCATE TABLE subscriptions, memberships, users, workspaces CASCADE',
  );
});

it('schreibt den Inhabern kurz vor dem Ende, genau einmal', async () => {
  await bereich('Bald', 2.5);
  await bereich('Spaeter', 10);
  await bereich('Vorbei', -1);

  expect(await planer().erinnern()).toBe(1);
  expect(gesendet.map((m) => m.to)).toEqual(['inhaber@bald.test']);
  expect(gesendet[0].subject).toBe('Ihre Testphase endet in 3 Tagen');
  expect(gesendet[0].text).toContain('https://app.example/abrechnung');

  expect(await planer().erinnern()).toBe(0);
  expect(gesendet).toHaveLength(1);
});

it('schweigt, wo nichts verkauft wird', async () => {
  await bereich('Bald', 1);

  expect(await planer(false).erinnern()).toBe(0);
  expect(gesendet).toHaveLength(0);
});
