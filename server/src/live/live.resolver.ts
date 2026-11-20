import { UseGuards } from '@nestjs/common';
import { Mutation, Resolver } from '@nestjs/graphql';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { LiveService } from './live.service';

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class LiveResolver {
  constructor(private readonly live: LiveService) {}

  @Mutation(() => String, {
    description:
      'Eine Eintrittskarte für den Ereignisstrom /live, eine Minute gültig und nur einmal einlösbar.',
  })
  liveTicket(@CurrentUser() user: RequestUser): Promise<string> {
    return this.live.ticketAusstellen(user);
  }
}
