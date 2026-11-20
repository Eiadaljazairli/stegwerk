import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WebhookEntity } from './webhook.entity';
import { WebhooksResolver } from './webhooks.resolver';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEntity]), WorkspacesModule],
  providers: [WebhooksService, WebhooksResolver],
})
export class WebhooksModule {}
