import { Injectable } from '@nestjs/common';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';

@Injectable()
export class WorkspaceRolesService {
  constructor(private readonly permissions: PermissionsService) {}

  async assertCanAdminister(caller: RequestUser, what: string): Promise<void> {
    await this.permissions.assert(caller, Permission.FIELD_MANAGE, what);
  }

  async assertCanManageMembers(
    caller: RequestUser,
    what: string,
  ): Promise<void> {
    await this.permissions.assert(caller, Permission.MEMBER_MANAGE, what);
  }
}
