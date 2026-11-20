import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ObjektBezeichnungenModule } from '../objekt-bezeichnungen/objekt-bezeichnungen.module';

@Module({
  imports: [
    CrmModule,
    CustomFieldsModule,
    WorkspacesModule,
    ObjektBezeichnungenModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
