import { UseGuards } from '@nestjs/common';
import { Args, Float, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { MembershipsService } from './memberships.service';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspacesService } from './workspaces.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class WorkspacesResolver {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Mutation(() => WorkspaceEntity)
  renameWorkspace(
    @CurrentUser() user: RequestUser,
    @Args('name') name: string,
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.rename(user, name);
  }

  @Mutation(() => WorkspaceEntity)
  setBaseInterestRate(
    @CurrentUser() user: RequestUser,
    @Args('percent', { type: () => Float, nullable: true }) percent?: number,
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.setBaseInterestRate(user, percent ?? null);
  }

  @Mutation(() => WorkspaceEntity)
  @UseGuards(NurMenschWache)
  setZweiFaktorPflicht(
    @CurrentUser() user: RequestUser,
    @Args('an') an: boolean,
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.setZweiFaktorPflicht(user, an);
  }

  @Mutation(() => WorkspaceEntity)
  @UseGuards(NurMenschWache)
  setLeerlauf(
    @CurrentUser() user: RequestUser,
    @Args('minuten', { type: () => Int, nullable: true }) minuten?: number,
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.setLeerlauf(user, minuten ?? null);
  }

  @Mutation(() => WorkspaceEntity)
  @UseGuards(NurMenschWache)
  setEinladungsDomains(
    @CurrentUser() user: RequestUser,
    @Args('domains', { type: () => [String] }) domains: string[],
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.setEinladungsDomains(user, domains);
  }

  @Mutation(() => WorkspaceEntity)
  @UseGuards(NurMenschWache)
  setPapierkorbTage(
    @CurrentUser() user: RequestUser,
    @Args('tage', { type: () => Int }) tage: number,
  ): Promise<WorkspaceEntity> {
    return this.workspacesService.setPapierkorbTage(user, tage);
  }

  @Mutation(() => MembershipEntity)
  @UseGuards(NurMenschWache)
  setTaskDigest(
    @CurrentUser() user: RequestUser,
    @Args('enabled') enabled: boolean,
  ): Promise<MembershipEntity> {
    return this.membershipsService.setTaskDigest(
      user.workspaceId,
      user.userId,
      enabled,
    );
  }

  @Mutation(() => MembershipEntity)
  @UseGuards(NurMenschWache)
  setErwaehnungMail(
    @CurrentUser() user: RequestUser,
    @Args('enabled') enabled: boolean,
  ): Promise<MembershipEntity> {
    return this.membershipsService.setErwaehnungMail(
      user.workspaceId,
      user.userId,
      enabled,
    );
  }

  @Query(() => [MembershipEntity])
  myWorkspaces(@CurrentUser() user: RequestUser): Promise<MembershipEntity[]> {
    return this.membershipsService.findForUser(user.userId);
  }

  @Query(() => MembershipRole)
  async myRole(@CurrentUser() user: RequestUser): Promise<MembershipRole> {
    const membership = await this.membershipsService.findOne(
      user.userId,
      user.workspaceId,
    );

    return membership?.role ?? MembershipRole.MEMBER;
  }

  @Query(() => [MembershipEntity])
  workspaceMembers(
    @CurrentUser() user: RequestUser,
  ): Promise<MembershipEntity[]> {
    return this.membershipsService.findForWorkspace(user.workspaceId);
  }
}
