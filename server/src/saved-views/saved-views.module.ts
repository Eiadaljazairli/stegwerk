import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MembershipEntity } from '../workspaces/membership.entity';
import { SavedViewDefaultEntity } from './saved-view-default.entity';
import { SavedViewEntity } from './saved-view.entity';
import { SavedViewsResolver } from './saved-views.resolver';
import { SavedViewsService } from './saved-views.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SavedViewEntity,
      SavedViewDefaultEntity,
      MembershipEntity,
    ]),
  ],
  providers: [SavedViewsService, SavedViewsResolver],
})
export class SavedViewsModule {}
