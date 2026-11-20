import { UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { QuoteTotals } from '../quotes/dto/quote.dto';
import { quoteTotals } from '../quotes/quote-totals';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  CreateInvoiceInputDto,
  InvoiceGapView,
  SetInvoiceLinesInput,
  UpdateInvoiceInputDto,
} from './dto/invoice.dto';
import { missingNumbers } from './invoice-numbers';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoiceEntity } from './invoice.entity';
import { InvoicesService } from './invoices.service';

@Resolver(() => InvoiceEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class InvoicesResolver {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly permissions: PermissionsService,
    private readonly documents: InvoiceDocumentsService,
  ) {}

  @ResolveField(() => [String])
  async xrechnungLuecken(
    @CurrentUser() user: RequestUser,
    @Parent() invoice: InvoiceEntity,
  ): Promise<string[]> {
    const luecken = await this.documents.xrechnungLuecken(
      user.workspaceId,
      invoice,
    );

    return luecken.map((luecke) => `${luecke.was} (${luecke.wo})`);
  }

  @ResolveField(() => [String])
  async zugferdLuecken(
    @CurrentUser() user: RequestUser,
    @Parent() invoice: InvoiceEntity,
  ): Promise<string[]> {
    const luecken = await this.documents.zugferdLuecken(
      user.workspaceId,
      invoice,
    );

    return luecken.map((luecke) => `${luecke.was} (${luecke.wo})`);
  }

  @ResolveField(() => QuoteTotals)
  totals(@Parent() invoice: InvoiceEntity): QuoteTotals {
    return quoteTotals(invoice.lines ?? [], invoice.smallBusiness);
  }

  @Query(() => [String])
  async datevLuecken(@CurrentUser() user: RequestUser): Promise<string[]> {
    await this.assert(user, Permission.INVOICE_VIEW, 'Rechnungen zu sehen');

    return this.documents.datevLuecken(user.workspaceId);
  }

  @Query(() => [InvoiceEntity])
  async invoices(@CurrentUser() user: RequestUser): Promise<InvoiceEntity[]> {
    await this.assert(user, Permission.INVOICE_VIEW, 'Rechnungen zu sehen');

    return this.invoicesService.list(user.workspaceId);
  }

  @Query(() => InvoiceEntity)
  async invoice(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvoiceEntity> {
    await this.assert(user, Permission.INVOICE_VIEW, 'eine Rechnung zu sehen');

    return this.invoicesService.findOne(user.workspaceId, id);
  }

  @Query(() => [InvoiceEntity])
  async invoicesForQuote(
    @CurrentUser() user: RequestUser,
    @Args('quoteId', { type: () => ID }) quoteId: string,
  ): Promise<InvoiceEntity[]> {
    await this.assert(user, Permission.INVOICE_VIEW, 'Rechnungen zu sehen');

    return this.invoicesService.forQuote(user.workspaceId, quoteId);
  }

  @Query(() => [InvoiceGapView])
  async invoiceGaps(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvoiceGapView[]> {
    await this.assert(user, Permission.INVOICE_VIEW, 'eine Rechnung zu sehen');

    return this.invoicesService.gaps(user.workspaceId, id);
  }

  @Query(() => [String])
  async invoiceNumberGaps(@CurrentUser() user: RequestUser): Promise<string[]> {
    await this.assert(user, Permission.INVOICE_VIEW, 'Rechnungen zu sehen');

    return missingNumbers(
      await this.invoicesService.issuedNumbers(user.workspaceId),
    );
  }

  @Mutation(() => InvoiceEntity)
  async createInvoiceFromQuote(
    @CurrentUser() user: RequestUser,
    @Args('quoteId', { type: () => ID }) quoteId: string,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_WRITE,
      'eine Rechnung anzulegen',
    );

    return this.invoicesService.createFromQuote(user.workspaceId, quoteId);
  }

  @Mutation(() => InvoiceEntity)
  async createInvoice(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateInvoiceInputDto,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_WRITE,
      'eine Rechnung anzulegen',
    );

    return this.invoicesService.create(user.workspaceId, input);
  }

  @Mutation(() => InvoiceEntity)
  async updateInvoice(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateInvoiceInputDto,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_WRITE,
      'eine Rechnung zu ändern',
    );

    return this.invoicesService.update(user.workspaceId, input);
  }

  @Mutation(() => InvoiceEntity)
  async setInvoiceLines(
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetInvoiceLinesInput,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_WRITE,
      'eine Rechnung zu ändern',
    );

    return this.invoicesService.setLines(
      user.workspaceId,
      input.invoiceId,
      input.lines,
    );
  }

  @Mutation(() => InvoiceEntity)
  async issueInvoice(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_ISSUE,
      'eine Rechnung zu stellen',
    );

    return this.invoicesService.issue(user.workspaceId, id);
  }

  @Mutation(() => InvoiceEntity)
  async markInvoicePaid(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('paidOn', { nullable: true }) paidOn?: string,
  ): Promise<InvoiceEntity> {
    await this.assert(user, Permission.INVOICE_WRITE, 'eine Zahlung zu buchen');

    return this.invoicesService.markPaid(user.workspaceId, id, paidOn);
  }

  @Mutation(() => InvoiceEntity)
  async cancelInvoice(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvoiceEntity> {
    await this.assert(
      user,
      Permission.INVOICE_ISSUE,
      'eine Rechnung zu stornieren',
    );

    return this.invoicesService.cancel(user.workspaceId, id);
  }

  @Mutation(() => Boolean)
  async deleteInvoice(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.assert(
      user,
      Permission.INVOICE_WRITE,
      'einen Rechnungsentwurf zu löschen',
    );

    return this.invoicesService.remove(user.workspaceId, id);
  }

  private assert(
    user: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    return this.permissions.assert(user, permission, what);
  }
}
