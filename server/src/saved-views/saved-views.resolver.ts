import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import {
  CreateSavedViewInput,
  UpdateSavedViewInput,
} from './dto/saved-view.dto';
import { SavedViewEntity } from './saved-view.entity';
import { SavedViewsService } from './saved-views.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class SavedViewsResolver {
  constructor(private readonly savedViewsService: SavedViewsService) {}

  @Query(() => [SavedViewEntity])
  savedViews(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity })
    entity: CustomFieldEntity,
  ): Promise<SavedViewEntity[]> {
    return this.savedViewsService.list(user.workspaceId, user.userId, entity);
  }

  @Mutation(() => SavedViewEntity)
  createSavedView(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateSavedViewInput,
  ): Promise<SavedViewEntity> {
    return this.savedViewsService.create(user.workspaceId, user.userId, input);
  }

  @Mutation(() => SavedViewEntity)
  updateSavedView(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateSavedViewInput,
  ): Promise<SavedViewEntity> {
    return this.savedViewsService.update(user.workspaceId, user.userId, input);
  }

  @Mutation(() => Boolean)
  setDefaultSavedView(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity })
    entity: CustomFieldEntity,
    @Args('id', { type: () => ID, nullable: true }) id?: string,
  ): Promise<boolean> {
    return this.savedViewsService.setDefault(
      user.workspaceId,
      user.userId,
      entity,
      id ?? null,
    );
  }

  @Mutation(() => Boolean)
  deleteSavedView(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.savedViewsService.remove(user.workspaceId, user.userId, id);
  }
}
