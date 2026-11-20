import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { QuotesModule } from '../quotes/quotes.module';
import { EinstiegResolver } from './einstieg.resolver';
import { ErsteSchritteResolver } from './erste-schritte.resolver';

@Module({
  imports: [QuotesModule, CrmModule, CustomFieldsModule],
  providers: [ErsteSchritteResolver, EinstiegResolver],
})
export class OnboardingModule {}
