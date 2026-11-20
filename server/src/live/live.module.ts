import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { LiveController } from './live.controller';
import { LiveResolver } from './live.resolver';
import { LiveService } from './live.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [LiveController],
  providers: [LiveService, LiveResolver],
})
export class LiveModule {}
