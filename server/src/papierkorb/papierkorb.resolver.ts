import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { PermissionsService } from '../workspaces/permissions.service';
import { PapierkorbArt, PapierkorbEintrag } from './papierkorb.dto';
import { ARTEN, PapierkorbService } from './papierkorb.service';

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class PapierkorbResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly dienst: PapierkorbService,
  ) {}

  @Query(() => [PapierkorbEintrag])
  async papierkorb(
    @CurrentUser() user: RequestUser,
  ): Promise<PapierkorbEintrag[]> {
    const arten: PapierkorbArt[] = [];

    for (const art of Object.values(PapierkorbArt)) {
      if (await this.permissions.can(user, ARTEN[art].recht)) {
        arten.push(art);
      }
    }

    return this.dienst.liste(user.workspaceId, arten);
  }

  @Query(() => Int)
  papierkorbTage(@CurrentUser() user: RequestUser): Promise<number> {
    return this.dienst.frist(user.workspaceId);
  }

  @Mutation(() => Boolean)
  async wiederherstellen(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => PapierkorbArt }) art: PapierkorbArt,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      ARTEN[art].recht,
      'das wiederherzustellen',
    );

    return this.dienst.wiederherstellen(user.workspaceId, art, id);
  }

  @Mutation(() => Boolean)
  async endgueltigLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => PapierkorbArt }) art: PapierkorbArt,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      ARTEN[art].recht,
      'das endgültig zu löschen',
    );

    return this.dienst.endgueltig(user.workspaceId, art, id);
  }
}
