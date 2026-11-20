import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LetterheadEntity } from '../quotes/letterhead.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AvvAnnahmeEntity } from './avv-annahme.entity';
import { AvvResolver } from './avv.resolver';
import { AvvService } from './avv.service';
import { LegalController } from './legal.controller';
import { LegalResolver } from './legal.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([AvvAnnahmeEntity, LetterheadEntity]),
    WorkspacesModule,
  ],
  controllers: [LegalController],
  providers: [LegalResolver, AvvResolver, AvvService],
})
export class LegalModule {}
