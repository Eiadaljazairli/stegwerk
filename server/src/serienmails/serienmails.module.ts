import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrmModule } from '../crm/crm.module';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MAIL_SENDER, SmtpSender } from '../mailboxes/smtp-sender';
import { OAuthModule } from '../oauth/oauth.module';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AbmeldenController } from './abmelden.controller';
import {
  AbmeldungEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from './serienmail.entities';
import { SerienmailsResolver } from './serienmails.resolver';
import { SerienmailsScheduler } from './serienmails.scheduler';
import { SerienmailsService } from './serienmails.service';

@Module({
  imports: [
    OAuthModule,
    TypeOrmModule.forFeature([
      KampagneEntity,
      KampagnenEmpfaengerEntity,
      AbmeldungEntity,
      MailboxEntity,
      MailSperreEntity,
      SavedViewEntity,
      WorkspaceEntity,
    ]),
    CrmModule,
    WorkspacesModule,
  ],
  controllers: [AbmeldenController],
  providers: [
    SerienmailsService,
    SerienmailsResolver,
    SerienmailsScheduler,
    { provide: MAIL_SENDER, useClass: SmtpSender },
  ],
})
export class SerienmailsModule {}
