import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { sichererTransport } from '../kalender-sync/caldav-client';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OAuthVorgangEntity } from './oauth-vorgang.entity';
import { OAuthZugangEntity } from './oauth-zugang.entity';
import { OAuthResolver } from './oauth.resolver';
import { OAUTH_TRANSPORT, OAuthService } from './oauth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthZugangEntity, OAuthVorgangEntity]),
    WorkspacesModule,
  ],
  providers: [
    OAuthService,
    OAuthResolver,
    { provide: OAUTH_TRANSPORT, useFactory: () => sichererTransport(false) },
  ],
  exports: [OAuthService],
})
export class OAuthModule {}
