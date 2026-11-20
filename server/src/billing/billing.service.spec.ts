import { ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BillingService } from './billing.service';
import {
  BillingPlan,
  PAST_DUE_GRACE_DAYS,
  SubscriptionStatus,
  TRIAL_SEATS,
} from './plans';
import { SubscriptionEntity } from './subscription.entity';

const SUITE = 'billing';
const DAY_MS = 24 * 60 * 60 * 1000;

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: BillingService;
let ohneKasseDienst: BillingService;
let workspaceId: string;

const mitKasse = {
  get: (schluessel: string) =>
    schluessel === 'stripeSecretKey' ? 'sk_test_probe' : undefined,
} as unknown as ConfigService;

const ohneKasse = {
  get: () => '',
} as unknown as ConfigService;

const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new BillingService(
    dataSource.getRepository(SubscriptionEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(InvitationEntity),
    mitKasse,
  );

  ohneKasseDienst = new BillingService(
    dataSource.getRepository(SubscriptionEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(InvitationEntity),
    ohneKasse,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Probe', slug: 'probe' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE subscriptions, memberships, invitations, users CASCADE',
  );
});

const addUser = async (email: string) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );
};

const addMember = async (email: string) => {
  const user = await addUser(email);

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save(
    memberships.create({
      userId: user.id,
      workspaceId,
      role: MembershipRole.MEMBER,
    }),
  );

  return user;
};

const addInvitation = async (email: string, expiresAt: Date) => {
  const inviter = await addUser(`inviter-${email}`);
  const invitations = dataSource.getRepository(InvitationEntity);

  return invitations.save(
    invitations.create({
      workspaceId,
      email,
      role: MembershipRole.MEMBER,
      tokenHash: email.padEnd(64, '0').slice(0, 64),
      expiresAt,
      invitedById: inviter.id,
    }),
  );
};

const setSubscription = async (fields: Partial<SubscriptionEntity>) => {
  const subscriptions = dataSource.getRepository(SubscriptionEntity);
  const existing = await service.ensureSubscription(workspaceId);

  return subscriptions.save(subscriptions.merge(existing, fields));
};

describe('seat counting', () => {
  it('counts members', async () => {
    await addMember('eine@example.de');
    await addMember('zwei@example.de');

    expect((await service.getEntitlement(workspaceId)).usedSeats).toBe(2);
  });

  it('counts an outstanding invitation as a taken seat', async () => {
    await addMember('eine@example.de');
    await addInvitation('zwei@example.de', daysFromNow(7));

    expect((await service.getEntitlement(workspaceId)).usedSeats).toBe(2);
  });

  it('does not count an expired invitation', async () => {
    await addMember('eine@example.de');
    await addInvitation('abgelaufen@example.de', daysFromNow(-1));

    expect((await service.getEntitlement(workspaceId)).usedSeats).toBe(1);
  });

  it('does not count an invitation twice once it is accepted', async () => {
    const invitation = await addInvitation('neue@example.de', daysFromNow(7));

    await addMember('neue@example.de');
    await dataSource
      .getRepository(InvitationEntity)
      .update(invitation.id, { acceptedAt: new Date() });

    expect((await service.getEntitlement(workspaceId)).usedSeats).toBe(1);
  });
});

describe('the seat limit', () => {
  it('allows an invitation while a seat is free', async () => {
    await addMember('eine@example.de');

    await expect(
      service.assertSeatAvailable(workspaceId),
    ).resolves.toBeUndefined();
  });

  it('refuses once the trial seats are taken', async () => {
    for (let index = 0; index < TRIAL_SEATS; index += 1) {
      await addMember(`person${index}@example.de`);
    }

    await expect(service.assertSeatAvailable(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('counts a pending invitation towards the limit', async () => {
    await addMember('eine@example.de');
    await addMember('zwei@example.de');
    await addInvitation('drei@example.de', daysFromNow(7));

    await expect(service.assertSeatAvailable(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('never exceeds the plan maximum, however many seats were bought', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.ACTIVE,
      seats: 50,
    });

    for (let index = 0; index < 10; index += 1) {
      await addMember(`person${index}@example.de`);
    }

    await expect(service.assertSeatAvailable(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('stops at the seats bought, even on a plan with no maximum', async () => {
    await setSubscription({
      plan: BillingPlan.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
      seats: 2,
    });

    await addMember('eine@example.de');
    await addMember('zwei@example.de');

    await expect(service.assertSeatAvailable(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('who may write', () => {
  it('allows a trial that has not run out', async () => {
    await setSubscription({
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysFromNow(3),
    });

    const entitlement = await service.getEntitlement(workspaceId);

    expect(entitlement.canWrite).toBe(true);
    expect(entitlement.trialDaysLeft).toBe(3);
  });

  it('turns read-only when the trial has ended', async () => {
    await setSubscription({
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: daysFromNow(-1),
    });

    const entitlement = await service.getEntitlement(workspaceId);

    expect(entitlement.canWrite).toBe(false);
    expect(entitlement.readOnly).toBe(true);
    await expect(service.assertCanWrite(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('keeps a failed payment working through the grace period', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: daysFromNow(-(PAST_DUE_GRACE_DAYS - 1)),
    });

    expect((await service.getEntitlement(workspaceId)).canWrite).toBe(true);
  });

  it('stops once the grace period has run out', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: daysFromNow(-(PAST_DUE_GRACE_DAYS + 1)),
    });

    expect((await service.getEntitlement(workspaceId)).canWrite).toBe(false);
  });

  it('keeps a cancelled subscription working until the period already paid for ends', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: daysFromNow(5),
      cancelAtPeriodEnd: true,
    });

    expect((await service.getEntitlement(workspaceId)).canWrite).toBe(true);
  });

  it('stops a cancelled subscription after that period', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: daysFromNow(-1),
    });

    expect((await service.getEntitlement(workspaceId)).canWrite).toBe(false);
  });
});

describe('a workspace with no subscription row', () => {
  it('gets a trial rather than an error', async () => {
    const entitlement = await service.getEntitlement(workspaceId);

    expect(entitlement.plan).toBe(BillingPlan.TRIAL);
    expect(entitlement.status).toBe(SubscriptionStatus.TRIALING);
    expect(entitlement.seats).toBe(TRIAL_SEATS);
    expect(entitlement.canWrite).toBe(true);
  });

  it('does not create a second row on the next read', async () => {
    await service.getEntitlement(workspaceId);
    await service.getEntitlement(workspaceId);

    expect(
      await dataSource.getRepository(SubscriptionEntity).countBy({
        workspaceId,
      }),
    ).toBe(1);
  });
});

describe('eine Anlage ohne Zahlungsabwicklung', () => {
  it('sperrt nach der Testphase nicht', async () => {
    await setSubscription({ trialEndsAt: daysFromNow(-1) });

    expect((await ohneKasseDienst.getEntitlement(workspaceId)).canWrite).toBe(
      true,
    );
    expect((await ohneKasseDienst.getEntitlement(workspaceId)).readOnly).toBe(
      false,
    );
  });

  it('sperrt mit Kasse sehr wohl', async () => {
    await setSubscription({ trialEndsAt: daysFromNow(-1) });

    expect((await service.getEntitlement(workspaceId)).canWrite).toBe(false);
  });

  it('lässt auch schreiben, wenn das Abonnement gekündigt wäre', async () => {
    await setSubscription({
      plan: BillingPlan.STARTER,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: daysFromNow(-30),
    });

    expect((await ohneKasseDienst.getEntitlement(workspaceId)).canWrite).toBe(
      true,
    );
  });

  it('zeigt keinen ablaufenden Zähler', async () => {
    await setSubscription({ trialEndsAt: daysFromNow(2) });

    expect(
      (await ohneKasseDienst.getEntitlement(workspaceId)).trialDaysLeft,
    ).toBeNull();
    expect((await service.getEntitlement(workspaceId)).trialDaysLeft).toBe(2);
  });

  it('kennt keine Platzgrenze', async () => {
    for (let index = 0; index < TRIAL_SEATS + 2; index += 1) {
      await addMember(`person${index}@example.de`);
    }

    await expect(
      ohneKasseDienst.assertSeatAvailable(workspaceId),
    ).resolves.toBeUndefined();
    await expect(service.assertSeatAvailable(workspaceId)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
