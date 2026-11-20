import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { UserEntity } from '../users/user.entity';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadLogoController } from './letterhead-logo.controller';
import { LetterheadsResolver } from './letterheads.resolver';
import { LetterheadsService } from './letterheads.service';
import { ProductEntity } from './product.entity';
import { ProductsResolver } from './products.resolver';
import { ProductsService } from './products.service';
import { QuoteLineEntity } from './quote-line.entity';
import { QuoteEntity } from './quote.entity';
import { QuoteDocumentsController } from './quote-documents.controller';
import { QuoteDocumentsService } from './quote-documents.service';
import { PublicQuotesController } from './public-quotes.controller';
import { QuoteLinksService } from './quote-links.service';
import { QuotesResolver } from './quotes.resolver';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuoteEntity,
      QuoteLineEntity,
      ProductEntity,
      LetterheadEntity,
      ContactEntity,
      DealEntity,
      UserEntity,
    ]),
  ],
  controllers: [
    QuoteDocumentsController,
    PublicQuotesController,
    LetterheadLogoController,
  ],
  providers: [
    QuotesService,
    QuotesResolver,
    ProductsService,
    ProductsResolver,
    LetterheadsService,
    LetterheadsResolver,
    QuoteDocumentsService,
    QuoteLinksService,
  ],
  exports: [QuotesService, ProductsService, LetterheadsService],
})
export class QuotesModule {}
