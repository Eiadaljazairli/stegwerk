import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MembershipEntity } from '../workspaces/membership.entity';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldsResolver } from './custom-fields.resolver';
import { CustomFieldsService } from './custom-fields.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomFieldDefinition,
      MembershipEntity,
      RoleEntity,
    ]),
  ],
  providers: [
    CustomFieldsService,
    CustomFieldsResolver,
    PermissionsService,
    WorkspaceRolesService,
  ],
  exports: [CustomFieldsService, WorkspaceRolesService, PermissionsService],
})
export class CustomFieldsModule {}
