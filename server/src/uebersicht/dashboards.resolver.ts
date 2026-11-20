import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { DashboardsService } from './dashboards.service';
import {
  DashboardAendernInput,
  DashboardAnlegenInput,
  DashboardView,
  KachelInput,
} from './uebersicht.dto';

@Resolver(() => DashboardView)
@UseGuards(GqlAuthGuard)
export class DashboardsResolver {
  constructor(private readonly dienst: DashboardsService) {}

  @Query(() => [DashboardView])
  dashboards(@CurrentUser() user: RequestUser): Promise<DashboardView[]> {
    return this.dienst.liste(user.workspaceId, user.userId);
  }

  @Query(() => DashboardView)
  dashboard(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DashboardView> {
    return this.dienst.holen(user.workspaceId, user.userId, id);
  }

  @Mutation(() => DashboardView)
  dashboardAnlegen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: DashboardAnlegenInput,
  ): Promise<DashboardView> {
    return this.dienst.anlegen(user.workspaceId, user.userId, input);
  }

  @Mutation(() => DashboardView)
  dashboardAendern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: DashboardAendernInput,
  ): Promise<DashboardView> {
    return this.dienst.aendern(user.workspaceId, user.userId, id, input);
  }

  @Mutation(() => DashboardView)
  dashboardKachelnSpeichern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('kacheln', { type: () => [KachelInput] }) kacheln: KachelInput[],
  ): Promise<DashboardView> {
    return this.dienst.kachelnSpeichern(
      user.workspaceId,
      user.userId,
      id,
      kacheln as unknown as Record<string, unknown>[],
    );
  }

  @Mutation(() => Boolean)
  dashboardLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.dienst.loeschen(user.workspaceId, user.userId, id);
  }
}
