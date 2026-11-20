import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(ZugangsWache)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class McpController {
  constructor(
    private readonly mcp: McpService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async nachricht(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    this.pruefeHerkunft(req);

    const antwort = await this.mcp.verarbeite(body, req);

    if (antwort === null) {
      res.status(202).end();

      return;
    }

    res.status(200).json(antwort);
  }

  @Get()
  strom(@Res() res: Response): void {
    res.status(405).setHeader('Allow', 'POST').end();
  }

  @Delete()
  beenden(@Res() res: Response): void {
    res.status(405).setHeader('Allow', 'POST').end();
  }

  private pruefeHerkunft(req: Request): void {
    const herkunft = req.headers.origin;

    if (herkunft === undefined) {
      return;
    }

    const erlaubt = (this.config.get<string>('webOrigin') ?? '').replace(
      /\/$/u,
      '',
    );

    if (herkunft !== erlaubt) {
      throw new ForbiddenException('Diese Herkunft ist nicht erlaubt.');
    }
  }
}
