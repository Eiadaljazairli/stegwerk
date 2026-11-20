import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';

import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { qrSvg } from './qr-svg';
import { TwoFactorService } from './two-factor.service';

@ObjectType()
export class TwoFactorSetup {
  @Field()
  secret: string;

  @Field()
  url: string;

  @Field()
  qrSvg: string;
}

@ObjectType()
export class TwoFactorStatus {
  @Field()
  enabled: boolean;

  @Field()
  recoveryCodesLeft: number;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class TwoFactorResolver {
  constructor(private readonly zweiterFaktor: TwoFactorService) {}

  @Query(() => TwoFactorStatus)
  async twoFactorStatus(
    @CurrentUser() user: RequestUser,
  ): Promise<TwoFactorStatus> {
    return {
      enabled: await this.zweiterFaktor.istAktiv(user.userId),
      recoveryCodesLeft: await this.zweiterFaktor.offeneCodes(user.userId),
    };
  }

  @Mutation(() => TwoFactorSetup)
  async beginTwoFactorSetup(
    @CurrentUser() user: RequestUser,
  ): Promise<TwoFactorSetup> {
    const einrichtung = await this.zweiterFaktor.beginnen(
      user.userId,
      user.email,
    );

    return { ...einrichtung, qrSvg: qrSvg(einrichtung.url) };
  }

  @Mutation(() => [String])
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  confirmTwoFactorSetup(
    @CurrentUser() user: RequestUser,
    @Args('code') code: string,
  ): Promise<string[]> {
    return this.zweiterFaktor.bestaetigen(user.userId, code);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  disableTwoFactor(
    @CurrentUser() user: RequestUser,
    @Args('code') code: string,
  ): Promise<boolean> {
    return this.zweiterFaktor.abschalten(user.userId, code);
  }
}
