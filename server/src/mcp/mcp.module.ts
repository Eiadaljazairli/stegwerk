import { Module } from '@nestjs/common';

import { KiVorschlaegeModule } from '../ki-vorschlaege/ki-vorschlaege.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [KiVorschlaegeModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
