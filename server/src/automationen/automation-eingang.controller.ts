import {
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Request } from 'express';

import { BillingService } from '../billing/billing.service';
import { AutomationenService } from './automationen.service';

@Controller('public/automationen')
@UseGuards(ThrottlerGuard)
export class AutomationEingangController {
  constructor(
    private readonly automationen: AutomationenService,
    private readonly billing: BillingService,
  ) {}

  @Post(':token')
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async eingang(
    @Param('token') token: string,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<{ ok: true }> {
    const { automation, lauf } = await this.automationen.eingang(
      token,
      request.rawBody,
      request.headers,
    );

    await this.billing.assertCanWrite(automation.workspaceId);

    void lauf().catch(() => undefined);

    return { ok: true };
  }
}
