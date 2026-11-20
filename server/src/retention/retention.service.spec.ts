import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import {
  BillingPlan,
  PAST_DUE_GRACE_DAYS,
  SubscriptionStatus,
} from '../billing/plans';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { PrivacyService } from '../privacy/privacy.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { RetentionService } from './retention.service';

const SUITE = 'retention';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: RetentionService;
let mail: { send: jest.Mock };
let erase: jest.Mock;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const daysAhead = (days: number) => new Date(Date.now() + days * DAY_MS);

const config = {
  get: (key: string) =>
    key === 'retention.days'
      ? RETENTION_DAYS
      : key === 'retention.enabled'
        ? true
        : key === 'stripeSecretKey'
          ? 'sk_test_probe'
          : undefined,
  getOrThrow: () => 'https://app.example.de',
} as unknown as ConfigService;

const configOhneKasse = {
  get: (key: string) =>
    key === 'retention.days'
      ? RETENTION_DAYS
      : key === 'retention.enabled'
        ? true
        : undefined,
  getOrThrow: () => 'https://app.example.de',
} as unknown as ConfigService;

const makeWorkspace = async (
  name: string,
  subscription: Partial<SubscriptionEntity>,
) => {
  const workspace = await dataSource.getRepository(WorkspaceEntity).save(
    dataSource.getRepository(WorkspaceEntity).create({
      name,
      slug: name.toLowerCase().replace(/\W+/g, '-'),
    }),
  );

  const user = await dataSource.getRepository(UserEntity).save(
    dataSource.getRepository(UserEntity).create({
      email: `${workspace.slug}@example.de`,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );

  await dataSource.getRepository(MembershipEntity).save(
    dataSource.getRepository(MembershipEntity).create({
      userId: user.id,
      workspaceId: workspace.id,
      role: MembershipRole.OWNER,
    }),
  );

  await dataSource.getRepository(SubscriptionEntity).save(
    dataSource.getRepository(SubscriptionEntity).create({
      workspaceId: workspace.id,
      plan: BillingPlan.TRIAL,
      status: SubscriptionStatus.TRIALING,
      seats: 3,
      ...subscription,
    }),
  );

  await dataSource
    .getRepository(CompanyEntity)
    .save(
      dataSource
        .getRepository(CompanyEntity)
        .create({ workspaceId: workspace.id, name: `${name} Kunde` }),
    );

  return workspace;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users, companies CASCADE');

  mail = { send: jest.fn().mockResolvedValue(true) };
  erase = jest.fn().mockResolvedValue(undefined);

  service = new RetentionService(
    dataSource.getRepository(SubscriptionEntity),
    dataSource.getRepository(WorkspaceEntity),
    dataSource.getRepository(MembershipEntity),
    { erase } as unknown as PrivacyService,
    mail as never,
    config,
  );
});

describe('what counts as out of time', () => {
  it('ignores a workspace that is still paying', async () => {
    await makeWorkspace('Aktiv', {
      status: SubscriptionStatus.ACTIVE,
      plan: BillingPlan.STARTER,
      currentPeriodEnd: daysAhead(20),
    });

    expect(await service.candidates()).toEqual([]);
  });

  it('ignores a trial that is still running', async () => {
    await makeWorkspace('Testphase', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAhead(5),
    });

    expect(await service.candidates()).toEqual([]);
  });

  it('counts from the day a trial ended', async () => {
    await makeWorkspace('Abgelaufen', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(10),
    });

    const [candidate] = await service.candidates();

    expect(candidate.daysSinceAccessEnded).toBe(10);
    expect(candidate.daysLeft).toBe(RETENTION_DAYS - 10);
  });

  it('counts from the end of the paid period for a cancellation', async () => {
    await makeWorkspace('Gekuendigt', {
      status: SubscriptionStatus.CANCELED,
      plan: BillingPlan.STARTER,
      currentPeriodEnd: daysAgo(30),
    });

    const [candidate] = await service.candidates();

    expect(candidate.daysSinceAccessEnded).toBe(30);
  });

  it('gives a failed payment its grace period first', async () => {
    await makeWorkspace('Zahlung offen', {
      status: SubscriptionStatus.PAST_DUE,
      plan: BillingPlan.STARTER,
      currentPeriodEnd: daysAgo(PAST_DUE_GRACE_DAYS - 2),
    });

    expect(await service.candidates()).toEqual([]);
  });
});

describe('warning before deleting', () => {
  it('says nothing while the deadline is far off', async () => {
    await makeWorkspace('Frisch', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(5),
    });

    const report = await service.sweep({ dryRun: false });

    expect(report.warned).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('warns a month out', async () => {
    await makeWorkspace('Bald', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 30),
    });

    const report = await service.sweep({ dryRun: false });

    expect(report.warned).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);

    const sent = mail.send.mock.calls[0][0];

    expect(sent.text).toMatch(/abrechnung/);
    expect(sent.text).toMatch(/Export/);
  });

  it('does not repeat the warning on the next sweep', async () => {
    await makeWorkspace('Bald', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 30),
    });

    await service.sweep({ dryRun: false });
    const second = await service.sweep({ dryRun: false });

    expect(second.warned).toBe(0);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('warns again as the deadline gets close', async () => {
    await makeWorkspace('Bald', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 30),
    });

    await service.sweep({ dryRun: false });

    const later = await service.sweep(
      { dryRun: false },
      new Date(Date.now() + 23 * DAY_MS),
    );

    expect(later.warned).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('sends exactly two warnings over the whole period, not one a week', async () => {
    await makeWorkspace('Bald', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 40),
    });

    let warnings = 0;

    for (let day = 0; day <= 40; day += 1) {
      const report = await service.sweep(
        { dryRun: false },
        new Date(Date.now() + day * DAY_MS),
      );

      warnings += report.warned;
    }

    expect(warnings).toBe(2);
  });
});

describe('deleting', () => {
  it('leaves a workspace alone until the period is up', async () => {
    await makeWorkspace('Noch Zeit', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 1),
    });

    const report = await service.sweep({ dryRun: false });

    expect(report.deleted).toBe(0);
    expect(erase).not.toHaveBeenCalled();
  });

  it('erases one whose time is up', async () => {
    const workspace = await makeWorkspace('Vorbei', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 1),
    });

    const report = await service.sweep({ dryRun: false });

    expect(report.deleted).toBe(1);
    expect(erase).toHaveBeenCalledWith(workspace.id);
  });

  it('tells the owner it happened, before the record of them is gone', async () => {
    await makeWorkspace('Vorbei', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 1),
    });

    await service.sweep({ dryRun: false });

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe('vorbei@example.de');
  });

  it('stops once somebody pays again', async () => {
    const workspace = await makeWorkspace('Gerettet', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 5),
    });

    await dataSource.getRepository(SubscriptionEntity).update(
      { workspaceId: workspace.id },
      {
        status: SubscriptionStatus.ACTIVE,
        plan: BillingPlan.STARTER,
        currentPeriodEnd: daysAhead(30),
      },
    );

    const report = await service.sweep({ dryRun: false });

    expect(report.deleted).toBe(0);
    expect(erase).not.toHaveBeenCalled();
  });
});

describe('a dry run', () => {
  it('reports what a real one would do and does none of it', async () => {
    await makeWorkspace('Vorbei', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 1),
    });
    await makeWorkspace('Bald', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS - 10),
    });

    const preview = await service.sweep({ dryRun: true });

    expect(preview.dryRun).toBe(true);
    expect(preview.deleted).toBe(1);
    expect(preview.warned).toBe(1);
    expect(erase).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('matches what the real sweep then does', async () => {
    await makeWorkspace('Vorbei', {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 1),
    });

    const preview = await service.sweep({ dryRun: true });
    const real = await service.sweep({ dryRun: false });

    expect({ warned: real.warned, deleted: real.deleted }).toEqual({
      warned: preview.warned,
      deleted: preview.deleted,
    });
  });
});

describe('ohne Zahlungsabwicklung', () => {
  it('sieht keinen Arbeitsbereich als abgelaufen an', async () => {
    const ohneKasse = new RetentionService(
      dataSource.getRepository(SubscriptionEntity),
      dataSource.getRepository(WorkspaceEntity),
      dataSource.getRepository(MembershipEntity),
      { erase } as unknown as PrivacyService,
      mail as never,
      configOhneKasse,
    );

    await makeWorkspace('Lange her', {
      plan: BillingPlan.TRIAL,
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 60),
    });

    expect(await ohneKasse.candidates()).toHaveLength(0);

    expect(await service.candidates()).toHaveLength(1);
  });

  it('löscht beim Durchlauf nichts', async () => {
    const ohneKasse = new RetentionService(
      dataSource.getRepository(SubscriptionEntity),
      dataSource.getRepository(WorkspaceEntity),
      dataSource.getRepository(MembershipEntity),
      { erase } as unknown as PrivacyService,
      mail as never,
      configOhneKasse,
    );

    await makeWorkspace('Auch lange her', {
      plan: BillingPlan.TRIAL,
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysAgo(RETENTION_DAYS + 60),
    });

    const bericht = await ohneKasse.sweep({ dryRun: false });

    expect(bericht.deleted).toBe(0);
    expect(bericht.warned).toBe(0);
    expect(erase).not.toHaveBeenCalled();
  });
});
