import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LetterheadEntity } from '../quotes/letterhead.entity';
import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { PublicFormsController } from './public-forms.controller';
import { WebFormEntity } from './web-form.entity';
import { WebFormsResolver } from './web-forms.resolver';
import { WebFormsService } from './web-forms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebFormEntity, LetterheadEntity, UserEntity]),
    WorkspacesModule,
  ],
  controllers: [PublicFormsController],
  providers: [WebFormsService, WebFormsResolver],
})
export class WebFormsModule {}
