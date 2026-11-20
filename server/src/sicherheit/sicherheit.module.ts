import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { SicherheitResolver } from './sicherheit.resolver';
import { SicherheitService } from './sicherheit.service';
import { SicherheitsMailsService } from './sicherheits-mails.service';

@Module({
  imports: [WorkspacesModule, ApiKeysModule],
  providers: [SicherheitService, SicherheitResolver, SicherheitsMailsService],
})
export class SicherheitModule {}
