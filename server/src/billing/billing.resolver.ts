import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { BillingService } from './billing.service';
import { BillingInterval, EntitlementView, PlanView } from './dto/billing.dto';
import { BillingPlan, PLANS } from './plans';
import { StripeService } from './stripe.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class BillingResolver {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeService: StripeService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => EntitlementView)
  async entitlement(
    @CurrentUser() user: RequestUser,
  ): Promise<EntitlementView> {
    const entitlement = await this.billingService.getEntitlement(
      user.workspaceId,
    );

    return {
      ...entitlement,
      billingConfigured: this.stripeService.isConfigured,
    };
  }

  @Query(() => [PlanView])
  billingPlans(): PlanView[] {
    return Object.values(PLANS);
  }

  @Mutation(() => String)
  @UseGuards(NurMenschWache)
  async createCheckoutSession(
    @CurrentUser() user: RequestUser,
    @Args('plan', { type: () => BillingPlan }) plan: BillingPlan,
    @Args('interval', { type: () => BillingInterval })
    interval: BillingInterval,
    @Args('seats', { type: () => Int }) seats: number,
  ): Promise<string> {
    await this.assertAbrechnung(user);

    return this.stripeService.createCheckoutSession(
      user.workspaceId,
      user.email,
      plan,
      interval,
      seats,
    );
  }

  @Mutation(() => String)
  @UseGuards(NurMenschWache)
  async createBillingPortalSession(
    @CurrentUser() user: RequestUser,
  ): Promise<string> {
    await this.assertAbrechnung(user);

    return this.stripeService.createPortalSession(user.workspaceId);
  }

  private assertAbrechnung(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.BILLING_MANAGE,
      'die Abrechnung zu ändern',
    );
  }
}
