import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { PermissionsService } from '../workspaces/permissions.service';
import { FavoritArt, FavoritView } from './favoriten.dto';
import { FAVORIT_ARTEN, FavoritenService } from './favoriten.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class FavoritenResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly dienst: FavoritenService,
  ) {}

  @Query(() => [FavoritView])
  async meineFavoriten(
    @CurrentUser() user: RequestUser,
  ): Promise<FavoritView[]> {
    const arten: FavoritArt[] = [];

    for (const art of Object.values(FavoritArt)) {
      if (await this.permissions.can(user, FAVORIT_ARTEN[art].recht)) {
        arten.push(art);
      }
    }

    return this.dienst.liste(user.userId, user.workspaceId, arten);
  }

  @Mutation(() => Boolean)
  async favoritUmschalten(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => FavoritArt }) art: FavoritArt,
    @Args('datensatzId', { type: () => ID }, ParseUUIDPipe) datensatzId: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      FAVORIT_ARTEN[art].recht,
      'das zu sehen',
    );

    return this.dienst.umschalten(
      user.userId,
      user.workspaceId,
      art,
      datensatzId,
    );
  }
}
