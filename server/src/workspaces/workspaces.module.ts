import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EinladungsVorschlaegeService } from './einladungs-vorschlaege';
import { InvitationEntity } from './invitation.entity';
import { InvitationsResolver } from './invitations.resolver';
import { InvitationsService } from './invitations.service';
import { MembershipEntity } from './membership.entity';
import { MembershipsService } from './memberships.service';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { RolesResolver } from './roles.resolver';
import { RolesService } from './roles.service';
import { SichtfeldInterceptor } from './sichtfeld.interceptor';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesResolver } from './workspaces.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipEntity,
      WorkspaceEntity,
      InvitationEntity,
      RoleEntity,
    ]),
  ],
  providers: [
    WorkspacesService,
    PermissionsService,
    RolesService,
    RolesResolver,
    MembershipsService,
    WorkspacesResolver,
    InvitationsService,
    InvitationsResolver,
    EinladungsVorschlaegeService,
    { provide: APP_INTERCEPTOR, useClass: SichtfeldInterceptor },
  ],
  exports: [MembershipsService, InvitationsService, PermissionsService],
})
export class WorkspacesModule {}
