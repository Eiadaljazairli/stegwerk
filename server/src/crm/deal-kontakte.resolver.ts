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
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';
import { DEAL_ROLLEN, DealKontakteService } from './deal-kontakte.service';
import { ContactEntity } from './entities/contact.entity';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { DealEntity } from './entities/deal.entity';

@Resolver(() => DealKontaktEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class DealKontakteResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly beteiligte: DealKontakteService,
  ) {}

  @ResolveField('contact', () => ContactEntity, { nullable: true })
  contact(@Parent() zeile: DealKontaktEntity): Promise<ContactEntity | null> {
    return sichtbareAkte('contact', zeile.contact);
  }

  @Query(() => [String])
  dealRollen(): string[] {
    return DEAL_ROLLEN;
  }

  @Mutation(() => DealKontaktEntity)
  async dealKontaktHinzufuegen(
    @CurrentUser() user: RequestUser,
    @Args('dealId', { type: () => ID }) dealId: string,
    @Args('contactId', { type: () => ID }) contactId: string,
    @Args('rolle', { type: () => String, nullable: true })
    rolle?: string | null,
  ): Promise<DealKontaktEntity> {
    await this.permissions.assert(
      user,
      Permission.DEAL_WRITE,
      'Geschäfte zu ändern',
    );

    return this.beteiligte.hinzufuegen(
      user.workspaceId,
      dealId,
      contactId,
      rolle,
    );
  }

  @Mutation(() => DealKontaktEntity)
  async dealKontaktRolle(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('rolle', { type: () => String, nullable: true })
    rolle?: string | null,
  ): Promise<DealKontaktEntity> {
    await this.permissions.assert(
      user,
      Permission.DEAL_WRITE,
      'Geschäfte zu ändern',
    );

    return this.beteiligte.rolleAendern(user.workspaceId, id, rolle);
  }

  @Mutation(() => Boolean)
  async dealKontaktEntfernen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.DEAL_WRITE,
      'Geschäfte zu ändern',
    );

    return this.beteiligte.entfernen(user.workspaceId, id);
  }

  @Mutation(() => DealEntity)
  async dealKontaktZumHauptkontakt(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DealEntity> {
    await this.permissions.assert(
      user,
      Permission.DEAL_WRITE,
      'Geschäfte zu ändern',
    );

    return this.beteiligte.zumHauptkontakt(user.workspaceId, id);
  }
}
