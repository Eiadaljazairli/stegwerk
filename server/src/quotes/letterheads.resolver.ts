import { UseGuards } from '@nestjs/common';
import {
  Args,
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
import { LetterheadGapView, UpdateLetterheadInput } from './dto/letterhead.dto';
import { logoDataUrl } from './firmenlogo';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';

@Resolver(() => LetterheadEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class LetterheadsResolver {
  constructor(
    private readonly letterheads: LetterheadsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => LetterheadEntity)
  letterhead(@CurrentUser() user: RequestUser): Promise<LetterheadEntity> {
    return this.letterheads.get(user.workspaceId);
  }

  @Query(() => [LetterheadGapView])
  letterheadGaps(
    @CurrentUser() user: RequestUser,
  ): Promise<LetterheadGapView[]> {
    return this.letterheads.gaps(user.workspaceId);
  }

  @Mutation(() => LetterheadEntity)
  async updateLetterhead(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateLetterheadInput,
  ): Promise<LetterheadEntity> {
    await this.permissions.assert(
      user,
      Permission.LETTERHEAD_MANAGE,
      'den Briefkopf zu ändern',
    );

    return this.letterheads.update(user.workspaceId, input);
  }

  @ResolveField(() => String, { nullable: true })
  logoDataUrl(@Parent() letterhead: LetterheadEntity): string | null {
    return logoDataUrl(letterhead.logo, letterhead.logoMime);
  }

  @Mutation(() => LetterheadEntity)
  async removeLetterheadLogo(
    @CurrentUser() user: RequestUser,
  ): Promise<LetterheadEntity> {
    await this.permissions.assert(
      user,
      Permission.LETTERHEAD_MANAGE,
      'den Briefkopf zu ändern',
    );

    return this.letterheads.removeLogo(user.workspaceId);
  }
}
