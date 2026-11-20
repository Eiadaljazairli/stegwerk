import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ObjektBezeichnungenResolver } from './objekt-bezeichnungen.resolver';
import { ObjektBezeichnungenService } from './objekt-bezeichnungen.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceEntity]), WorkspacesModule],
  providers: [ObjektBezeichnungenService, ObjektBezeichnungenResolver],
  exports: [ObjektBezeichnungenService],
})
export class ObjektBezeichnungenModule {}
