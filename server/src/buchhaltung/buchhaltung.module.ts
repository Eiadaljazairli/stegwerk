import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BillingModule } from '../billing/billing.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import {
  BUCHHALTUNG_HTTP,
  sichererBuchhaltungsTransport,
} from './anbieter/http';
import {
  BuchhaltungKontaktEntity,
  BuchhaltungUebertragungEntity,
  BuchhaltungVerbindungEntity,
} from './buchhaltung.entities';
import {
  BuchhaltungResolver,
  RechnungBuchhaltungResolver,
} from './buchhaltung.resolver';
import { BuchhaltungScheduler } from './buchhaltung.scheduler';
import { BuchhaltungService } from './buchhaltung.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BuchhaltungVerbindungEntity,
      BuchhaltungUebertragungEntity,
      BuchhaltungKontaktEntity,
    ]),
    BillingModule,
    InvoicesModule,
    WorkspacesModule,
  ],
  providers: [
    BuchhaltungService,
    BuchhaltungResolver,
    RechnungBuchhaltungResolver,
    BuchhaltungScheduler,
    { provide: BUCHHALTUNG_HTTP, useFactory: sichererBuchhaltungsTransport },
  ],
})
export class BuchhaltungModule {}
