import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttachmentsModule } from '../attachments/attachments.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { BegleitbelegDocumentsController } from './begleitbeleg-documents.controller';
import {
  BegleitbelegEntity,
  BegleitbelegPositionEntity,
} from './begleitbeleg.entity';
import { BegleitbelegeResolver } from './begleitbelege.resolver';
import { BegleitbelegeService } from './begleitbelege.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BegleitbelegEntity, BegleitbelegPositionEntity]),
    QuotesModule,
    AttachmentsModule,
    WorkspacesModule,
  ],
  controllers: [BegleitbelegDocumentsController],
  providers: [BegleitbelegeService, BegleitbelegeResolver],
})
export class BegleitbelegeModule {}
