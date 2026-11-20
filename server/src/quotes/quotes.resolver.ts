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
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  CreateQuoteInput,
  QuoteTotals,
  SetQuoteLinesInput,
  SetQuoteTextsInput,
  UpdateQuoteInput,
} from './dto/quote.dto';
import { quoteTotals } from './quote-totals';
import { QuoteEntity } from './quote.entity';
import { QuoteStatus } from './quote.types';
import { QuoteLinksService } from './quote-links.service';
import { QuotesService } from './quotes.service';

@Resolver(() => QuoteEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class QuotesResolver {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly permissions: PermissionsService,
    private readonly links: QuoteLinksService,
  ) {}

  @ResolveField(() => String, { nullable: true })
  publicLink(@Parent() quote: QuoteEntity): string | null {
    return this.links.publicLink(quote);
  }

  @Mutation(() => QuoteEntity)
  async createQuoteLink(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Angebote zu versenden',
    );

    return this.links.createLink(user.workspaceId, id, user.userId);
  }

  @Mutation(() => QuoteEntity)
  async revokeQuoteLink(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Angebote zu versenden',
    );

    return this.links.revokeLink(user.workspaceId, id);
  }

  @ResolveField(() => QuoteTotals)
  totals(@Parent() quote: QuoteEntity): QuoteTotals {
    return quoteTotals(quote.lines ?? [], quote.smallBusiness);
  }

  @Query(() => [QuoteEntity])
  async quotes(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID, nullable: true }) companyId?: string,
    @Args('dealId', { type: () => ID, nullable: true }) dealId?: string,
    @Args('status', { type: () => QuoteStatus, nullable: true })
    status?: QuoteStatus,
  ): Promise<QuoteEntity[]> {
    await this.assert(user, Permission.QUOTE_VIEW, 'Angebote zu sehen');

    const alle = await this.quotesService.list(user.workspaceId);

    if (
      companyId === undefined &&
      dealId === undefined &&
      status === undefined
    ) {
      return alle;
    }

    return alle.filter(
      (quote) =>
        (companyId === undefined || quote.companyId === companyId) &&
        (dealId === undefined || quote.dealId === dealId) &&
        (status === undefined || quote.status === status),
    );
  }

  @Query(() => QuoteEntity)
  async quote(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_VIEW, 'ein Angebot zu sehen');

    return this.quotesService.findOne(user.workspaceId, id);
  }

  @Mutation(() => QuoteEntity)
  async createQuote(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateQuoteInput,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_WRITE, 'Angebote anzulegen');

    return this.quotesService.create(
      user.workspaceId,
      input,
      user.apiKey === undefined ? user.userId : null,
    );
  }

  @Mutation(() => QuoteEntity)
  async updateQuote(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateQuoteInput,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_WRITE, 'Angebote zu ändern');

    return this.quotesService.update(user.workspaceId, input.id, input);
  }

  @Mutation(() => QuoteEntity)
  async setQuoteLines(
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetQuoteLinesInput,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_WRITE, 'Angebote zu ändern');

    return this.quotesService.setLines(
      user.workspaceId,
      input.quoteId,
      input.lines,
    );
  }

  @Mutation(() => QuoteEntity)
  async setQuoteTexts(
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetQuoteTextsInput,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_WRITE, 'Angebote zu ändern');

    return this.quotesService.setTexts(user.workspaceId, input);
  }

  @Mutation(() => QuoteEntity)
  async markQuoteSent(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Angebote zu versenden',
    );

    return this.quotesService.markSent(user.workspaceId, id);
  }

  @Mutation(() => QuoteEntity)
  async decideQuote(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('accepted') accepted: boolean,
  ): Promise<QuoteEntity> {
    await this.assert(
      user,
      Permission.QUOTE_WRITE,
      'die Antwort auf ein Angebot einzutragen',
    );

    return this.quotesService.decide(user.workspaceId, id, accepted);
  }

  @Mutation(() => QuoteEntity)
  async duplicateQuote(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteEntity> {
    await this.assert(user, Permission.QUOTE_WRITE, 'Angebote anzulegen');

    return this.quotesService.duplicate(user.workspaceId, id);
  }

  @Mutation(() => Boolean)
  async deleteQuote(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_DELETE,
      'Angebote zu löschen',
    );

    return this.quotesService.remove(user.workspaceId, id);
  }

  private assert(
    user: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    return this.permissions.assert(user, permission, what);
  }
}
