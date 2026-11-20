import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { WebhookEntity } from './webhook.entity';
import { WebhooksService } from './webhooks.service';

@InputType()
export class CreateWebhookInput {
  @Field()
  @IsString()
  @MaxLength(500)
  url: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty({ message: 'Bitte mindestens ein Ereignis wählen.' })
  @IsString({ each: true })
  events: string[];
}

@ObjectType()
export class CreatedWebhook {
  @Field(() => WebhookEntity)
  webhook: WebhookEntity;

  @Field()
  secret: string;
}

@Resolver(() => WebhookEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class WebhooksResolver {
  constructor(
    private readonly dienst: WebhooksService,
    private readonly permissions: PermissionsService,
  ) {}

  private recht(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'Webhooks zu verwalten',
    );
  }

  @Query(() => [WebhookEntity])
  async webhooks(@CurrentUser() user: RequestUser): Promise<WebhookEntity[]> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'Webhooks zu verwalten',
    );

    return this.dienst.list(user.workspaceId);
  }

  @Query(() => [String])
  async webhookEvents(@CurrentUser() user: RequestUser): Promise<string[]> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'Webhooks zu verwalten',
    );

    return this.dienst.abonnierbar(user.workspaceId, user.userId);
  }

  @Mutation(() => CreatedWebhook)
  @UseGuards(BillingWriteGuard)
  async createWebhook(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateWebhookInput,
  ): Promise<CreatedWebhook> {
    await this.recht(user);

    return this.dienst.create(
      user.workspaceId,
      input.url,
      input.events,
      user.userId,
    );
  }

  @Mutation(() => WebhookEntity)
  @UseGuards(BillingWriteGuard)
  async setWebhookActive(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('active') active: boolean,
  ): Promise<WebhookEntity> {
    await this.recht(user);

    return this.dienst.setActive(user.workspaceId, id, active);
  }

  @Mutation(() => WebhookEntity)
  @UseGuards(BillingWriteGuard)
  async testWebhook(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WebhookEntity> {
    await this.recht(user);

    return this.dienst.test(user.workspaceId, id);
  }

  @Mutation(() => Boolean)
  async deleteWebhook(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.recht(user);

    return this.dienst.remove(user.workspaceId, id);
  }
}
