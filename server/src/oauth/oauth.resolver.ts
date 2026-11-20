import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { type CookieOptions, type Request } from 'express';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { OAuthService } from './oauth.service';

export const OAUTH_COOKIE = 'stegwerk_oauth';

export const oauthCookieOptionen = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/oauth',
  maxAge: 10 * 60_000,
});

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class OAuthResolver {
  constructor(
    private readonly oauth: OAuthService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [String])
  oauthAnbieter(): string[] {
    return this.oauth.konfiguriert();
  }

  @Mutation(() => String)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async oauthStarten(
    @CurrentUser() user: RequestUser,
    @Args('anbieter') anbieter: string,
    @Args('zweck') zweck: string,
    @Context() kontext: { req: Request },
    @Args('postfachArt', { type: () => String, nullable: true })
    postfachArt?: string | null,
  ): Promise<string> {
    if (postfachArt === 'gemeinsam') {
      await this.permissions.assert(
        user,
        Permission.MAILBOX_SHARED_MANAGE,
        'gemeinsame Postfächer einzurichten',
      );
    }

    const { url, bindung } = await this.oauth.starten(
      user,
      anbieter,
      zweck,
      postfachArt ?? null,
    );

    kontext.req.res?.cookie(OAUTH_COOKIE, bindung, oauthCookieOptionen());

    return url;
  }
}
