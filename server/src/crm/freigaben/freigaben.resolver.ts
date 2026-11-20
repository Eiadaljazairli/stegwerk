import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../../billing/guards/billing-write.guard';
import {
  SICHTBARKEITS_ARTEN,
  type SichtbarkeitsArt,
} from '../../workspaces/sichtbarkeit';
import { FreigabeStand, FreigebenInput, ZugriffZeile } from './freigaben.dto';
import { FreigabenService } from './freigaben.service';

const artPruefen = (art: string): SichtbarkeitsArt => {
  if (!(SICHTBARKEITS_ARTEN as readonly string[]).includes(art)) {
    throw new BadRequestException(
      'Freigeben lassen sich Firmen (company), Kontakte (contact) und Geschäfte (deal).',
    );
  }

  return art as SichtbarkeitsArt;
};

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class FreigabenResolver {
  constructor(private readonly freigaben: FreigabenService) {}

  @Query(() => FreigabeStand)
  freigabeStand(
    @CurrentUser() user: RequestUser,
    @Args('art') art: string,
    @Args('datensatzId', { type: () => ID }) datensatzId: string,
  ): Promise<FreigabeStand> {
    return this.freigaben.stand(user, artPruefen(art), datensatzId);
  }

  @Query(() => [ZugriffZeile])
  werSiehtDas(
    @CurrentUser() user: RequestUser,
    @Args('art') art: string,
    @Args('datensatzId', { type: () => ID }) datensatzId: string,
  ): Promise<ZugriffZeile[]> {
    return this.freigaben.werSiehtDas(user, artPruefen(art), datensatzId);
  }

  @Mutation(() => FreigabeStand)
  freigeben(
    @CurrentUser() user: RequestUser,
    @Args('input') input: FreigebenInput,
  ): Promise<FreigabeStand> {
    return this.freigaben.freigeben(
      user,
      artPruefen(input.art),
      input.datensatzId,
      input.userId,
      input.stufe,
    );
  }

  @Mutation(() => Boolean)
  freigabeEntziehen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.freigaben.entziehen(user, id);
  }
}
