import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApiKeyEntity } from './api-key.entity';
import { NurMenschWache, ZugangsWache } from './api-key.guard';
import { ApiKeysResolver } from './api-keys.resolver';
import { ApiKeysService } from './api-keys.service';
import { VorschlagSchluesselInterceptor } from './vorschlag-schluessel.interceptor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKeyEntity, UserEntity]),
    WorkspacesModule,
  ],
  providers: [
    ApiKeysService,
    ApiKeysResolver,
    ZugangsWache,
    NurMenschWache,
    { provide: APP_INTERCEPTOR, useClass: VorschlagSchluesselInterceptor },
  ],
  exports: [ApiKeysService, ZugangsWache, NurMenschWache],
})
export class ApiKeysModule {}
