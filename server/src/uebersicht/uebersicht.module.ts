import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DashboardsResolver } from './dashboards.resolver';
import { DashboardsService } from './dashboards.service';
import { UebersichtResolver } from './uebersicht.resolver';
import { UebersichtService } from './uebersicht.service';

@Module({
  imports: [WorkspacesModule],
  providers: [
    UebersichtService,
    UebersichtResolver,
    DashboardsService,
    DashboardsResolver,
  ],
})
export class UebersichtModule {}
