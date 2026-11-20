import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KiVorschlagEntity } from './ki-vorschlag.entity';
import { KiVorschlaegeResolver } from './ki-vorschlaege.resolver';
import { KiVorschlaegeService } from './ki-vorschlaege.service';

@Module({
  imports: [TypeOrmModule.forFeature([KiVorschlagEntity]), WorkspacesModule],
  providers: [KiVorschlaegeService, KiVorschlaegeResolver],
  exports: [KiVorschlaegeService],
})
export class KiVorschlaegeModule {}
