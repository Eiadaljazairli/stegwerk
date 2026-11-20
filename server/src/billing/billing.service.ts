import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { InvitationEntity } from '../workspaces/invitation.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import {
  BillingPlan,
  kasseEingerichtet,
  PAST_DUE_GRACE_DAYS,
  PLANS,
  SubscriptionStatus,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from './plans';
import { SubscriptionEntity } from './subscription.entity';

export type Entitlement = {
  plan: BillingPlan;
  status: SubscriptionStatus;
  seats: number;
  usedSeats: number;
  canWrite: boolean;
  readOnly: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepository: Repository<MembershipEntity>,
    @InjectRepository(InvitationEntity)
    private readonly invitationRepository: Repository<InvitationEntity>,
    private readonly configService: ConfigService,
  ) {}

  get verkauftPlaetze(): boolean {
    return kasseEingerichtet(this.configService.get<string>('stripeSecretKey'));
  }

  private async countUsedSeats(workspaceId: string): Promise<number> {
    const [members, pendingInvitations] = await Promise.all([
      this.membershipRepository.countBy({ workspaceId }),
      this.invitationRepository.countBy({
        workspaceId,
        acceptedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      }),
    ]);

    return members + pendingInvitations;
  }

  async ensureSubscription(workspaceId: string): Promise<SubscriptionEntity> {
    const existing = await this.subscriptionRepository.findOne({
      where: { workspaceId },
    });

    if (existing !== null) {
      return existing;
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * DAY_MS);

    return this.subscriptionRepository.save(
      this.subscriptionRepository.create({
        workspaceId,
        plan: BillingPlan.TRIAL,
        status: SubscriptionStatus.TRIALING,
        seats: TRIAL_SEATS,
        trialEndsAt,
      }),
    );
  }

  private daysLeft(until: Date | null): number | null {
    if (until === null) {
      return null;
    }

    return Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY_MS));
  }

  private canWrite(subscription: SubscriptionEntity): boolean {
    if (!this.verkauftPlaetze) {
      return true;
    }

    const now = Date.now();

    switch (subscription.status) {
      case SubscriptionStatus.TRIALING:
        return (
          subscription.trialEndsAt !== null &&
          subscription.trialEndsAt.getTime() > now
        );

      case SubscriptionStatus.ACTIVE:
        return true;

      case SubscriptionStatus.PAST_DUE:
        return (
          subscription.currentPeriodEnd !== null &&
          subscription.currentPeriodEnd.getTime() +
            PAST_DUE_GRACE_DAYS * DAY_MS >
            now
        );

      case SubscriptionStatus.CANCELED:
        return (
          subscription.currentPeriodEnd !== null &&
          subscription.currentPeriodEnd.getTime() > now
        );

      default:
        return false;
    }
  }

  async getEntitlement(workspaceId: string): Promise<Entitlement> {
    const subscription = await this.ensureSubscription(workspaceId);
    const usedSeats = await this.countUsedSeats(workspaceId);
    const canWrite = this.canWrite(subscription);

    return {
      plan: subscription.plan,
      status: subscription.status,
      seats: subscription.seats,
      usedSeats,
      canWrite,
      readOnly: !canWrite,
      trialDaysLeft:
        subscription.status === SubscriptionStatus.TRIALING &&
        this.verkauftPlaetze
          ? this.daysLeft(subscription.trialEndsAt)
          : null,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  async assertCanWrite(workspaceId: string): Promise<void> {
    const entitlement = await this.getEntitlement(workspaceId);

    if (!entitlement.canWrite) {
      throw new ForbiddenException(
        entitlement.status === SubscriptionStatus.TRIALING
          ? 'Your trial has ended. Choose a plan to continue.'
          : 'Your subscription is not active. Update your billing to continue.',
      );
    }
  }

  async assertSeatAvailable(workspaceId: string): Promise<void> {
    if (!this.verkauftPlaetze) {
      return;
    }

    const entitlement = await this.getEntitlement(workspaceId);
    const limit = PLANS[entitlement.plan].maxSeats;
    const effectiveLimit =
      limit === null ? entitlement.seats : Math.min(limit, entitlement.seats);

    if (entitlement.usedSeats >= effectiveLimit) {
      throw new ForbiddenException(
        `Alle ${effectiveLimit} Plätze sind belegt. Buchen Sie weitere Plätze oder wechseln Sie den Tarif, um jemanden einzuladen.`,
      );
    }
  }

  findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<SubscriptionEntity | null> {
    return this.subscriptionRepository.findOne({ where: { stripeCustomerId } });
  }

  save(subscription: SubscriptionEntity): Promise<SubscriptionEntity> {
    return this.subscriptionRepository.save(subscription);
  }
}
