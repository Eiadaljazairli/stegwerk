import { Module } from '@nestjs/common';

import { PrivacyResolver } from './privacy.resolver';
import { PrivacyService } from './privacy.service';

@Module({
  exports: [PrivacyService],
  providers: [PrivacyService, PrivacyResolver],
})
export class PrivacyModule {}
