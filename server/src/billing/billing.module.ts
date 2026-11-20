import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InvitationEntity } from '../workspaces/invitation.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { BillingResolver } from './billing.resolver';
import { BillingService } from './billing.service';
import { BillingWriteGuard } from './guards/billing-write.guard';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { SubscriptionEntity } from './subscription.entity';
import { TestphaseScheduler } from './testphase.scheduler';
import { VerlaengerungScheduler } from './verlaengerung.scheduler';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      MembershipEntity,
      InvitationEntity,
    ]),
    WorkspacesModule,
  ],
  controllers: [StripeWebhookController],
  providers: [
    BillingService,
    StripeService,
    BillingResolver,
    BillingWriteGuard,
    TestphaseScheduler,
    VerlaengerungScheduler,
  ],
  exports: [BillingService, BillingWriteGuard],
})
export class BillingModule {}
