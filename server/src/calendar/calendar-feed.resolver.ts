import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { CalendarFeedService } from './calendar-feed.service';

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class CalendarFeedResolver {
  constructor(
    private readonly feed: CalendarFeedService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => String, { nullable: true })
  async calendarFeedUrl(
    @CurrentUser() user: RequestUser,
  ): Promise<string | null> {
    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    return this.feed.url(user);
  }

  @Mutation(() => String)
  async enableCalendarFeed(
    @CurrentUser() user: RequestUser,
    @Args('renew', { nullable: true }) renew?: boolean,
  ): Promise<string> {
    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    return this.feed.enable(user, renew === true);
  }

  @Mutation(() => Boolean)
  async disableCalendarFeed(
    @CurrentUser() user: RequestUser,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    return this.feed.disable(user);
  }
}
