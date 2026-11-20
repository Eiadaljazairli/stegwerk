import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { FavoritenResolver } from './favoriten.resolver';
import { FavoritenService } from './favoriten.service';

@Module({
  imports: [WorkspacesModule],
  providers: [FavoritenService, FavoritenResolver],
})
export class FavoritenModule {}
