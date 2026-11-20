import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubscriptionEntity } from '../billing/subscription.entity';
import { PrivacyModule } from '../privacy/privacy.module';
import { MembershipEntity } from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { RetentionResolver } from './retention.resolver';
import { RetentionScheduler } from './retention.scheduler';
import { RetentionService } from './retention.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      WorkspaceEntity,
      MembershipEntity,
    ]),
    PrivacyModule,
  ],
  providers: [RetentionService, RetentionScheduler, RetentionResolver],
})
export class RetentionModule {}
