import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Request, type Response } from 'express';

import { CalendarFeedService } from './calendar-feed.service';

@Controller('appointments/feed')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class CalendarFeedController {
  constructor(private readonly feed: CalendarFeedService) {}

  @Get(':token')
  async abholen(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = Buffer.from(
      await this.feed.feed(token, request.hostname),
      'utf8',
    );

    response
      .status(200)
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Cache-Control', 'private, max-age=900')
      .setHeader('Content-Disposition', 'inline; filename="stegwerk.ics"')
      .end(content);
  }
}
