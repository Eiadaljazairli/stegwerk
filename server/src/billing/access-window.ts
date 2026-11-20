import { PAST_DUE_GRACE_DAYS, SubscriptionStatus } from './plans';
import { type SubscriptionEntity } from './subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

export const accessEndedAt = (
  subscription: SubscriptionEntity,
  verkauftPlaetze: boolean,
): Date | null => {
  if (!verkauftPlaetze) {
    return null;
  }

  switch (subscription.status) {
    case SubscriptionStatus.TRIALING:
      return subscription.trialEndsAt;

    case SubscriptionStatus.ACTIVE:
      return null;

    case SubscriptionStatus.PAST_DUE:
      return subscription.currentPeriodEnd === null
        ? null
        : new Date(
            subscription.currentPeriodEnd.getTime() +
              PAST_DUE_GRACE_DAYS * DAY_MS,
          );

    case SubscriptionStatus.CANCELED:
      return subscription.currentPeriodEnd;

    default:
      return null;
  }
};

export const daysSinceAccessEnded = (
  subscription: SubscriptionEntity,
  verkauftPlaetze: boolean,
  now = new Date(),
): number | null => {
  const ended = accessEndedAt(subscription, verkauftPlaetze);

  if (ended === null || ended.getTime() > now.getTime()) {
    return null;
  }

  return Math.floor((now.getTime() - ended.getTime()) / DAY_MS);
};
