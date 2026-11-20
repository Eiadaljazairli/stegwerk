import { ForbiddenException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import {
  AcceptInvitationInput,
  InvitationCreated,
  InviteMemberInput,
  MemberRemoved,
  RemoveMemberInput,
} from './dto/invitation.dto';
import {
  EinladungsVorschlaegeService,
  EinladungsVorschlag,
} from './einladungs-vorschlaege';
import { InvitationEntity } from './invitation.entity';
import { InvitationsService } from './invitations.service';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { RolesService } from './roles.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class InvitationsResolver {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly configService: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly roles: RolesService,
    private readonly vorschlaege: EinladungsVorschlaegeService,
  ) {}

  @Query(() => [EinladungsVorschlag])
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async einladungsVorschlaege(
    @CurrentUser() user: RequestUser,
  ): Promise<EinladungsVorschlag[]> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'Mitglieder einzuladen',
    );

    return this.vorschlaege.fuer(user.userId, user.workspaceId);
  }

  @Query(() => [InvitationEntity])
  pendingInvitations(
    @CurrentUser() user: RequestUser,
  ): Promise<InvitationEntity[]> {
    return this.invitationsService.findPending(user.workspaceId);
  }

  @Mutation(() => InvitationCreated)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  async inviteMember(
    @CurrentUser() user: RequestUser,
    @Args('input') input: InviteMemberInput,
  ): Promise<InvitationCreated> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'Mitglieder einzuladen',
    );

    const vorlage = (await this.roles.list(user.workspaceId)).find(
      (role) => role.templateKey === input.role,
    );

    await this.permissions.assertGrantable(
      user,
      vorlage ?? {
        everything: input.role === MembershipRole.OWNER,
        permissions: [],
      },
      'einladen',
    );

    const { invitation, token, delivered } =
      await this.invitationsService.invite(
        user.userId,
        user.workspaceId,
        input.email,
        input.role,
      );

    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    return {
      invitation,
      inviteUrl: `${webOrigin}/einladung/${token}`,
      delivered,
    };
  }

  @Mutation(() => Boolean)
  revokeInvitation(
    @CurrentUser() user: RequestUser,
    @Args('id') id: string,
  ): Promise<boolean> {
    return this.invitationsService.revoke(user.userId, user.workspaceId, id);
  }

  @Mutation(() => MembershipEntity)
  @UseGuards(NurMenschWache)
  acceptInvitation(
    @CurrentUser() user: RequestUser,
    @Args('input') input: AcceptInvitationInput,
  ): Promise<MembershipEntity> {
    return this.invitationsService.accept(input.token, user.userId);
  }

  @Mutation(() => MemberRemoved)
  async removeMember(
    @CurrentUser() user: RequestUser,
    @Args('input') input: RemoveMemberInput,
  ): Promise<MemberRemoved> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'Mitglieder zu entfernen',
    );

    if (
      (await this.permissions.holdsEverything(
        input.userId,
        user.workspaceId,
      )) &&
      !(await this.permissions.holdsEverything(user.userId, user.workspaceId))
    ) {
      throw new ForbiddenException('Einen Inhaber entfernt nur ein Inhaber.');
    }

    return this.invitationsService.removeMember(
      user.userId,
      user.workspaceId,
      input.userId,
      input.nachfolgerId ?? user.userId,
    );
  }
}
