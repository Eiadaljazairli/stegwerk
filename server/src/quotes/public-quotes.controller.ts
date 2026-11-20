import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Response } from 'express';

import { QuoteDocumentsService } from './quote-documents.service';
import {
  type OeffentlichesAngebot,
  QuoteLinksService,
} from './quote-links.service';

@Controller('public/quotes')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicQuotesController {
  constructor(
    private readonly links: QuoteLinksService,
    private readonly documents: QuoteDocumentsService,
  ) {}

  @Get(':token')
  async show(@Param('token') token: string): Promise<OeffentlichesAngebot> {
    const quote = await this.links.findByToken(token);

    return this.links.view(quote);
  }

  @Get(':token/pdf')
  async pdf(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const quote = await this.links.findByToken(token);
    const { fileName, content } = await this.documents.pdf(
      quote.workspaceId,
      quote.id,
    );

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }

  @Post(':token/decision')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  decide(
    @Param('token') token: string,
    @Body() body: { annehmen?: unknown; name?: unknown },
  ): Promise<OeffentlichesAngebot> {
    if (typeof body.annehmen !== 'boolean') {
      throw new BadRequestException('Annehmen oder ablehnen?');
    }

    return this.links.decide(
      token,
      body.annehmen,
      typeof body.name === 'string' ? body.name : '',
    );
  }
}
