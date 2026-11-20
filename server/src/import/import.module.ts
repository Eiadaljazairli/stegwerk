import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ImportResolver } from './import.resolver';
import { ImportService } from './import.service';

@Module({
  imports: [WorkspacesModule],
  providers: [ImportService, ImportResolver],
})
export class ImportModule {}
