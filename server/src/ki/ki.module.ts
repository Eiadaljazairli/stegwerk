import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BillingModule } from '../billing/billing.module';
import { KiVorschlaegeModule } from '../ki-vorschlaege/ki-vorschlaege.module';
import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KI_HTTP, sichererKiTransport } from './ki-anbieter';
import { KiEinstellungEntity } from './ki-einstellung.entity';
import { KiResolver } from './ki.resolver';
import { KiService } from './ki.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([KiEinstellungEntity, UserEntity]),
    BillingModule,
    KiVorschlaegeModule,
    WorkspacesModule,
  ],
  providers: [
    KiService,
    KiResolver,
    { provide: KI_HTTP, useFactory: sichererKiTransport },
  ],
})
export class KiModule {}
