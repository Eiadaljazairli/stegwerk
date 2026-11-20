import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { DunningLevel } from './dunning';
import { DunningService } from './dunning.service';
import { InvoiceReminderEntity } from './invoice-reminder.entity';
import { TaskDigestService } from './task-digest.service';

@ObjectType('OpenItem')
export class OpenItemView {
  @Field(() => InvoiceEntity)
  invoice: InvoiceEntity;

  @Field(() => DunningLevel)
  level: DunningLevel;

  @Field(() => DunningLevel, { nullable: true })
  nextStep: DunningLevel | null;

  @Field(() => String, { nullable: true })
  nextStepOn: string | null;

  @Field(() => Int)
  daysOverdue: number;

  @Field()
  inDefault: boolean;

  @Field(() => Int)
  interestCents: number;

  @Field(() => Int)
  lateFeeCents: number;

  @Field(() => String, { nullable: true })
  recipientEmail: string | null;
}

@ObjectType('ReminderPreview')
export class ReminderPreviewView {
  @Field(() => DunningLevel)
  level: DunningLevel;

  @Field()
  subject: string;

  @Field()
  body: string;

  @Field(() => String, { nullable: true })
  to: string | null;
}

@ObjectType('DigestPreview')
export class DigestPreviewView {
  @Field()
  subject: string;

  @Field()
  body: string;
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class RemindersResolver {
  constructor(
    private readonly dunning: DunningService,
    private readonly digest: TaskDigestService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [OpenItemView])
  async openItems(@CurrentUser() user: RequestUser): Promise<OpenItemView[]> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'die offenen Posten zu sehen',
    );

    return (await this.dunning.openItems(user.workspaceId)).map((item) => ({
      invoice: item.invoice,
      level: item.state.level,
      nextStep: item.state.nextStep,
      nextStepOn: item.state.nextStepOn,
      daysOverdue: item.state.daysOverdue,
      inDefault: item.state.inDefault,
      interestCents: item.interestCents,
      lateFeeCents: item.lateFeeCents,
      recipientEmail: item.recipientEmail,
    }));
  }

  @Query(() => [InvoiceReminderEntity])
  async invoiceReminders(
    @CurrentUser() user: RequestUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceReminderEntity[]> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'die Mahnungen zu einer Rechnung zu sehen',
    );

    return this.dunning.history(user.workspaceId, invoiceId);
  }

  @Query(() => ReminderPreviewView)
  async reminderPreview(
    @CurrentUser() user: RequestUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<ReminderPreviewView> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'eine Mahnung vorzubereiten',
    );

    return this.dunning.preview(user.workspaceId, invoiceId);
  }

  @Mutation(() => InvoiceReminderEntity)
  @UseGuards(BillingWriteGuard)
  async sendInvoiceReminder(
    @CurrentUser() user: RequestUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceReminderEntity> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_ISSUE,
      'eine Mahnung zu verschicken',
    );

    return this.dunning.send(user.workspaceId, invoiceId);
  }

  @Query(() => DigestPreviewView, { nullable: true })
  myTaskDigest(
    @CurrentUser() user: RequestUser,
  ): Promise<DigestPreviewView | null> {
    return this.digest.preview(user.workspaceId, user.userId);
  }
}
