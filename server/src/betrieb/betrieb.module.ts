import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { BetriebResolver } from './betrieb.resolver';
import { BetriebService } from './betrieb.service';
import { NutzungInterceptor } from './nutzung.interceptor';
import { NutzungService } from './nutzung.service';
import { WartungInterceptor } from './wartung.interceptor';
import { WartungService } from './wartung.service';
import { ZustandService } from './zustand.service';

@Module({
  imports: [ApiKeysModule],
  providers: [
    BetriebResolver,
    BetriebService,
    NutzungService,
    WartungService,
    ZustandService,
    { provide: APP_INTERCEPTOR, useClass: NutzungInterceptor },
    { provide: APP_INTERCEPTOR, useClass: WartungInterceptor },
  ],
})
export class BetriebModule {}
