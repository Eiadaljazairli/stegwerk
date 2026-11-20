import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { BillingPlan, SubscriptionStatus } from '../plans';

export enum BillingInterval {
  MONTH = 'month',
  YEAR = 'year',
}

registerEnumType(BillingInterval, { name: 'BillingInterval' });

@ObjectType()
export class EntitlementView {
  @Field(() => BillingPlan)
  plan: BillingPlan;

  @Field(() => SubscriptionStatus)
  status: SubscriptionStatus;

  @Field(() => Int)
  seats: number;

  @Field(() => Int)
  usedSeats: number;

  @Field()
  canWrite: boolean;

  @Field()
  readOnly: boolean;

  @Field(() => Int, { nullable: true })
  trialDaysLeft: number | null;

  @Field(() => Date, { nullable: true })
  currentPeriodEnd: Date | null;

  @Field()
  cancelAtPeriodEnd: boolean;

  @Field()
  billingConfigured: boolean;
}

@ObjectType()
export class PlanView {
  @Field(() => BillingPlan)
  plan: BillingPlan;

  @Field()
  name: string;

  @Field(() => Int)
  monthlyPricePerSeat: number;

  @Field(() => Int)
  yearlyPricePerSeat: number;

  @Field(() => Int, { nullable: true })
  maxSeats: number | null;

  @Field()
  purchasable: boolean;
}
