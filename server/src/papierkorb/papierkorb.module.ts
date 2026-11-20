import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { PapierkorbResolver } from './papierkorb.resolver';
import { PapierkorbScheduler } from './papierkorb.scheduler';
import { PapierkorbService } from './papierkorb.service';

@Module({
  imports: [WorkspacesModule],
  providers: [PapierkorbService, PapierkorbResolver, PapierkorbScheduler],
})
export class PapierkorbModule {}
