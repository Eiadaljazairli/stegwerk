import { Module } from '@nestjs/common';

import { KalenderSyncModule } from '../kalender-sync/kalender-sync.module';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { OAuthController } from './oauth.controller';
import { OAuthModule } from './oauth.module';

@Module({
  imports: [OAuthModule, MailboxesModule, KalenderSyncModule],
  controllers: [OAuthController],
})
export class OAuthRueckrufModule {}
