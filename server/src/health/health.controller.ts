import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type HealthResponse = {
  status: 'ok';
  uptimeSeconds: number;
};

type ReadinessResponse = {
  status: 'ready';
  database: 'reachable';
};

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  live(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        database: 'unreachable',
      });
    }

    return { status: 'ready', database: 'reachable' };
  }
}
