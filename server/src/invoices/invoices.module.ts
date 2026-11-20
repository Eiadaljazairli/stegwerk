import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { QuotesModule } from '../quotes/quotes.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { InvoiceCounterEntity } from './invoice-counter.entity';
import { InvoiceDocumentsController } from './invoice-documents.controller';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoiceSeriesEntity } from './invoice-series.entity';
import {
  InvoiceSeriesFieldResolver,
  InvoiceSeriesResolver,
} from './invoice-series.resolver';
import { InvoiceSeriesScheduler } from './invoice-series.scheduler';
import { InvoiceSeriesService } from './invoice-series.service';
import { UserEntity } from '../users/user.entity';
import { InvoiceLineEntity } from './invoice-line.entity';
import { InvoiceEntity } from './invoice.entity';
import { InvoicesResolver } from './invoices.resolver';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceLineEntity,
      InvoiceCounterEntity,
      InvoiceSeriesEntity,
      UserEntity,
      QuoteEntity,
      LetterheadEntity,
    ]),
    QuotesModule,
    WorkspacesModule,
  ],
  controllers: [InvoiceDocumentsController],
  providers: [
    InvoicesService,
    InvoicesResolver,
    InvoiceDocumentsService,
    InvoiceSeriesService,
    InvoiceSeriesResolver,
    InvoiceSeriesFieldResolver,
    InvoiceSeriesScheduler,
  ],
  exports: [InvoicesService, InvoiceDocumentsService],
})
export class InvoicesModule {}
