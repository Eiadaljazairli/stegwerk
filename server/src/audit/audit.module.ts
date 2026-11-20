import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuditLogEntity } from './audit-log.entity';
import { AuditResolver } from './audit.resolver';
import { BereichsprotokollResolver } from './bereichsprotokoll.resolver';
import { AuditSubscriber } from './audit.subscriber';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogEntity, UserEntity]),
    WorkspacesModule,
  ],
  providers: [AuditSubscriber, AuditResolver, BereichsprotokollResolver],
})
export class AuditModule {}
