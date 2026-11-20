import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BillingModule } from '../billing/billing.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AutomationEingangController } from './automation-eingang.controller';
import { AutomationAusfuehrungEntity } from './automation-ausfuehrung.entity';
import { AutomationEntity } from './automation.entity';
import {
  AutomationAusfuehrungResolver,
  AutomationenResolver,
} from './automationen.resolver';
import { AutomationenService } from './automationen.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationEntity, AutomationAusfuehrungEntity]),
    WorkspacesModule,
    CustomFieldsModule,
    MailboxesModule,
    BillingModule,
  ],
  controllers: [AutomationEingangController],
  providers: [
    AutomationenService,
    AutomationenResolver,
    AutomationAusfuehrungResolver,
  ],
})
export class AutomationenModule {}
