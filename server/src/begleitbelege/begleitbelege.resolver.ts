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

import { AttachmentEntity } from '../attachments/attachment.entity';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { QuoteTotals } from '../quotes/dto/quote.dto';
import { quoteTotals } from '../quotes/quote-totals';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  AuftragsbestaetigungInput,
  BegleitbelegFilterInput,
  LieferscheinInput,
  LieferstandPosition,
} from './begleitbeleg.dto';
import { BegleitbelegEntity } from './begleitbeleg.entity';
import { BegleitbelegArt } from './begleitbeleg.types';
import { BegleitbelegeService } from './begleitbelege.service';

@Resolver(() => BegleitbelegEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class BegleitbelegeResolver {
  constructor(
    private readonly service: BegleitbelegeService,
    private readonly permissions: PermissionsService,
  ) {}

  @ResolveField(() => QuoteTotals, { nullable: true })
  totals(@Parent() beleg: BegleitbelegEntity): QuoteTotals | null {
    return beleg.art === BegleitbelegArt.LIEFERSCHEIN
      ? null
      : quoteTotals(beleg.positionen ?? [], beleg.smallBusiness);
  }

  @Query(() => [BegleitbelegEntity])
  async begleitbelege(
    @CurrentUser() user: RequestUser,
    @Args('filter', { nullable: true }) filter?: BegleitbelegFilterInput,
  ): Promise<BegleitbelegEntity[]> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_VIEW,
      'Auftragsbestätigungen und Lieferscheine zu sehen',
    );

    return this.service.list(user.workspaceId, filter ?? {});
  }

  @Query(() => BegleitbelegEntity)
  async begleitbeleg(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BegleitbelegEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_VIEW,
      'Auftragsbestätigungen und Lieferscheine zu sehen',
    );

    return this.service.findOne(user.workspaceId, id);
  }

  @Query(() => [LieferstandPosition])
  async lieferstand(
    @CurrentUser() user: RequestUser,
    @Args('angebotId', { type: () => ID }) angebotId: string,
  ): Promise<LieferstandPosition[]> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_VIEW,
      'den Lieferstand eines Angebots zu sehen',
    );

    return (await this.service.lieferstand(user.workspaceId, angebotId)).map(
      (zeile) => ({
        angebotsPositionId: zeile.id,
        position: zeile.position,
        name: zeile.name,
        articleNumber: zeile.articleNumber,
        unit: zeile.unit,
        bestellt: zeile.bestellt,
        geliefert: zeile.geliefert,
        offen: zeile.offen,
      }),
    );
  }

  @Mutation(() => BegleitbelegEntity)
  async auftragsbestaetigungStellen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: AuftragsbestaetigungInput,
  ): Promise<BegleitbelegEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Auftragsbestätigungen zu stellen',
    );

    return this.service.auftragsbestaetigungStellen(
      user.workspaceId,
      user.apiKey === undefined ? user.userId : null,
      input,
    );
  }

  @Mutation(() => BegleitbelegEntity)
  async lieferscheinStellen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: LieferscheinInput,
  ): Promise<BegleitbelegEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Lieferscheine zu stellen',
    );

    return this.service.lieferscheinStellen(
      user.workspaceId,
      user.apiKey === undefined ? user.userId : null,
      input,
    );
  }

  @Mutation(() => BegleitbelegEntity)
  async begleitbelegStornieren(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('grund', { type: () => String, nullable: true }) grund?: string,
  ): Promise<BegleitbelegEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Auftragsbestätigungen und Lieferscheine zu stornieren',
    );

    return this.service.stornieren(
      user.workspaceId,
      user.apiKey === undefined ? user.userId : null,
      id,
      grund?.slice(0, 500) ?? null,
    );
  }

  @Mutation(() => AttachmentEntity)
  @UseGuards(NurMenschWache)
  async begleitbelegAlsAnhang(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AttachmentEntity> {
    await this.permissions.assert(
      user,
      Permission.QUOTE_SEND,
      'Auftragsbestätigungen und Lieferscheine zu verschicken',
    );

    return this.service.alsAnhang(user.workspaceId, user.userId, id);
  }
}
