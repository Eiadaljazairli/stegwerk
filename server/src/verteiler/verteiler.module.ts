import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrmModule } from '../crm/crm.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VerteilerEntity, VerteilerMitgliedEntity } from './verteiler.entity';
import {
  KontaktVerteilerResolver,
  VerteilerResolver,
} from './verteiler.resolver';
import { VerteilerService } from './verteiler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VerteilerEntity, VerteilerMitgliedEntity]),
    CrmModule,
    WorkspacesModule,
  ],
  providers: [VerteilerService, VerteilerResolver, KontaktVerteilerResolver],
  exports: [VerteilerService],
})
export class VerteilerModule {}
