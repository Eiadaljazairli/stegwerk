import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { UserEntity } from '../users/user.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { anzeige } from './api-key';
import { ApiKeyEntity } from './api-key.entity';
import { NurMenschWache } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyInput, CreatedApiKey } from './dto/api-key.dto';
import { SCHREIBMODI, type Schreibmodus } from './schreibmodus';

@Resolver(() => ApiKeyEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class ApiKeysResolver {
  constructor(
    private readonly schluessel: ApiKeysService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @ResolveField(() => String)
  anzeige(@Parent() schluessel: ApiKeyEntity): string {
    return anzeige(schluessel.kennung);
  }

  @ResolveField(() => String, { nullable: true })
  async createdByName(
    @Parent() schluessel: ApiKeyEntity,
  ): Promise<string | null> {
    if (schluessel.createdById === null) {
      return null;
    }

    const person = await this.users.findOne({
      where: { id: schluessel.createdById },
    });

    return person === null
      ? 'Entfernter Benutzer'
      : `${person.firstName} ${person.lastName}`;
  }

  @Query(() => [ApiKeyEntity])
  async apiKeys(@CurrentUser() user: RequestUser): Promise<ApiKeyEntity[]> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'die Schlüssel zu sehen',
    );

    return this.schluessel.list(user.workspaceId);
  }

  @Mutation(() => CreatedApiKey)
  async createApiKey(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateApiKeyInput,
  ): Promise<CreatedApiKey> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'einen Schlüssel anzulegen',
    );

    const { schluessel, token } = await this.schluessel.anlegen(user, {
      name: input.name,
      permissions: input.permissions,
      schreibmodus: input.schreibmodus,
      expiresAt:
        input.expiresAt === undefined ? null : new Date(input.expiresAt),
    });

    return { apiKey: schluessel, token };
  }

  @Mutation(() => ApiKeyEntity)
  @UseGuards(BillingWriteGuard)
  async setApiKeySchreibmodus(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('schreibmodus') schreibmodus: string,
  ): Promise<ApiKeyEntity> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'einen Schlüssel umzustellen',
    );

    if (!(SCHREIBMODI as readonly string[]).includes(schreibmodus)) {
      throw new BadRequestException('Der Modus ist direkt oder vorschlag.');
    }

    return this.schluessel.schreibmodusSetzen(
      user,
      id,
      schreibmodus as Schreibmodus,
    );
  }

  @Mutation(() => ApiKeyEntity)
  async revokeApiKey(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ApiKeyEntity> {
    await this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'einen Schlüssel zu widerrufen',
    );

    return this.schluessel.widerrufen(user.workspaceId, id);
  }
}
