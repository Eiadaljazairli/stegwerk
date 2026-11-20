import { registerEnumType } from '@nestjs/graphql';

export enum BillingPlan {
  TRIAL = 'trial',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

registerEnumType(BillingPlan, { name: 'BillingPlan' });
registerEnumType(SubscriptionStatus, { name: 'SubscriptionStatus' });

export type PlanDefinition = {
  plan: BillingPlan;
  name: string;
  monthlyPricePerSeat: number;
  yearlyPricePerSeat: number;
  maxSeats: number | null;
  purchasable: boolean;
};

export const TRIAL_DAYS = 14;
export const TRIAL_SEATS = 3;

export const PLANS: Record<BillingPlan, PlanDefinition> = {
  [BillingPlan.TRIAL]: {
    plan: BillingPlan.TRIAL,
    name: 'Testphase',
    monthlyPricePerSeat: 0,
    yearlyPricePerSeat: 0,
    maxSeats: TRIAL_SEATS,
    purchasable: false,
  },
  [BillingPlan.STARTER]: {
    plan: BillingPlan.STARTER,
    name: 'Starter',
    monthlyPricePerSeat: 1900,
    yearlyPricePerSeat: 19000,
    maxSeats: 10,
    purchasable: true,
  },
  [BillingPlan.PROFESSIONAL]: {
    plan: BillingPlan.PROFESSIONAL,
    name: 'Professional',
    monthlyPricePerSeat: 3900,
    yearlyPricePerSeat: 39000,
    maxSeats: null,
    purchasable: true,
  },
};

export const PAST_DUE_GRACE_DAYS = 7;

export const seatLimitFor = (plan: BillingPlan): number | null =>
  PLANS[plan].maxSeats;

export const kasseEingerichtet = (
  stripeSecretKey: string | undefined,
): boolean => (stripeSecretKey ?? '') !== '';
