import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { InvoiceSeriesEntity } from './invoice-series.entity';
import { InvoiceSeriesService } from './invoice-series.service';
import { InvoiceEntity } from './invoice.entity';
import { INTERVALLE } from './serien-termine';

@InputType()
export class CreateInvoiceSeriesInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId: string;

  @Field()
  @IsIn(INTERVALLE, { message: 'Monatlich, vierteljährlich oder jährlich.' })
  interval: string;

  @Field()
  @IsDateString({}, { message: 'Bitte ein Startdatum wählen.' })
  startOn: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString({}, { message: 'Bitte ein gültiges Enddatum wählen.' })
  endOn?: string;
}

@Resolver(() => InvoiceSeriesEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class InvoiceSeriesResolver {
  constructor(
    private readonly series: InvoiceSeriesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [InvoiceSeriesEntity])
  async invoiceSeriesList(
    @CurrentUser() user: RequestUser,
  ): Promise<InvoiceSeriesEntity[]> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'Rechnungen zu sehen',
    );

    return this.series.list(user.workspaceId);
  }

  @Mutation(() => InvoiceSeriesEntity)
  async createInvoiceSeries(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateInvoiceSeriesInput,
  ): Promise<InvoiceSeriesEntity> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_WRITE,
      'Rechnungen anzulegen',
    );

    return this.series.create(user.workspaceId, user.userId, input);
  }

  @Mutation(() => Boolean)
  async endInvoiceSeries(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.INVOICE_WRITE,
      'Rechnungen anzulegen',
    );

    return this.series.end(user.workspaceId, id);
  }
}

@Resolver(() => InvoiceEntity)
@UseGuards(GqlAuthGuard)
export class InvoiceSeriesFieldResolver {
  constructor(private readonly serien: InvoiceSeriesService) {}

  @ResolveField(() => InvoiceSeriesEntity, { nullable: true })
  templateSeries(
    @CurrentUser() user: RequestUser,
    @Parent() invoice: InvoiceEntity,
  ): Promise<InvoiceSeriesEntity | null> {
    return this.serien.forInvoice(user.workspaceId, invoice.id);
  }
}
