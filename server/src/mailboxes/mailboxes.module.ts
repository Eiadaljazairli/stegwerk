import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { OAuthModule } from '../oauth/oauth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ImapReader, MAIL_READER } from './imap-reader';
import { MailEntwurfEntity } from './mail-entwurf.entity';
import { MailEntwuerfeResolver } from './mail-entwuerfe.resolver';
import { MailEntwuerfeService } from './mail-entwuerfe.service';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailTemplateEntity } from './mail-template.entity';
import { MailTemplatesResolver } from './mail-templates.resolver';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesResolver } from './mailboxes.resolver';
import { MailboxesService } from './mailboxes.service';
import { MailboxSyncScheduler } from './mailbox-sync.scheduler';
import { PostfachZustandResolver } from './postfach-zustand.resolver';
import { MAIL_SENDER, SmtpSender } from './smtp-sender';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailboxEntity,
      MailMessageEntity,
      MailTemplateEntity,
      MailSperreEntity,
      MailEntwurfEntity,
      ContactEntity,
      CompanyEntity,
    ]),
    WorkspacesModule,
    OAuthModule,
  ],
  providers: [
    MailboxesService,
    MailboxesResolver,
    PostfachZustandResolver,
    MailTemplatesResolver,
    MailEntwuerfeService,
    MailEntwuerfeResolver,
    MailboxSyncScheduler,
    { provide: MAIL_READER, useClass: ImapReader },
    { provide: MAIL_SENDER, useClass: SmtpSender },
  ],
  exports: [MailboxesService, MailEntwuerfeService],
})
export class MailboxesModule {}
