import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AttachmentBlobEntity } from './attachment-blob.entity';
import { AttachmentEntity } from './attachment.entity';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsResolver } from './attachments.resolver';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttachmentEntity, AttachmentBlobEntity]),
    WorkspacesModule,
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsResolver],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
