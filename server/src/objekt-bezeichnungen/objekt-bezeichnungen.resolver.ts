import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { ObjektArt } from './objekt-bezeichnungen';
import {
  ObjektBezeichnungInput,
  ObjektBezeichnungView,
} from './objekt-bezeichnungen.dto';
import { ObjektBezeichnungenService } from './objekt-bezeichnungen.service';

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class ObjektBezeichnungenResolver {
  constructor(private readonly dienst: ObjektBezeichnungenService) {}

  @Query(() => [ObjektBezeichnungView])
  objektBezeichnungen(
    @CurrentUser() user: RequestUser,
  ): Promise<ObjektBezeichnungView[]> {
    return this.dienst.liste(user.workspaceId);
  }

  @Mutation(() => [ObjektBezeichnungView])
  setzeObjektBezeichnung(
    @CurrentUser() user: RequestUser,
    @Args('input') input: ObjektBezeichnungInput,
  ): Promise<ObjektBezeichnungView[]> {
    return this.dienst.setze(user, input);
  }

  @Mutation(() => [ObjektBezeichnungView])
  setzeObjektBezeichnungZurueck(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => ObjektArt, nullable: true }) art?: ObjektArt,
  ): Promise<ObjektBezeichnungView[]> {
    return this.dienst.zuruecksetzen(user, art ?? null);
  }
}
