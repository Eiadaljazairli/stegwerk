import { Global, Module } from '@nestjs/common';

import { LaeufeService } from './laeufe.service';
import { ProtokollAufbewahrung } from './protokoll-aufbewahrung';

@Global()
@Module({
  providers: [LaeufeService, ProtokollAufbewahrung],
  exports: [LaeufeService, ProtokollAufbewahrung],
})
export class UeberwachungModule {}
