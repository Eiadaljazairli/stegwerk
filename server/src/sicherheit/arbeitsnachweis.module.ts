import { Global, Module } from '@nestjs/common';

import { ArbeitsnachweisService } from './arbeitsnachweis';
import { ArbeitsnachweisController } from './arbeitsnachweis.controller';
import { ArbeitsnachweisGuard } from './arbeitsnachweis.guard';

@Global()
@Module({
  controllers: [ArbeitsnachweisController],
  providers: [ArbeitsnachweisService, ArbeitsnachweisGuard],
  exports: [ArbeitsnachweisService, ArbeitsnachweisGuard],
})
export class ArbeitsnachweisModule {}
