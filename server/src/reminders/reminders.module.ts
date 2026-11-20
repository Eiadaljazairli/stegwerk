import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TaskEntity } from '../crm/entities/task.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { MailModule } from '../mail/mail.module';
import { MembershipEntity } from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DunningService } from './dunning.service';
import { InvoiceReminderEntity } from './invoice-reminder.entity';
import { RemindersResolver } from './reminders.resolver';
import { TaskDigestScheduler } from './task-digest.scheduler';
import { TaskDigestService } from './task-digest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvoiceReminderEntity,
      InvoiceEntity,
      WorkspaceEntity,
      MembershipEntity,
      TaskEntity,
    ]),
    InvoicesModule,
    MailModule,
    WorkspacesModule,
  ],
  providers: [
    DunningService,
    TaskDigestService,
    RemindersResolver,
    TaskDigestScheduler,
  ],
  exports: [DunningService, TaskDigestService],
})
export class RemindersModule {}
