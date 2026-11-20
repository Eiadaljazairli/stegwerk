import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Request } from 'express';

import {
  ArbeitsnachweisGuard,
  zuSchnell,
} from '../sicherheit/arbeitsnachweis.guard';

import {
  type Anfrage,
  type OeffentlichesFormular,
  WebFormsService,
} from './web-forms.service';

@Controller('public/forms')
@UseGuards(ThrottlerGuard)
export class PublicFormsController {
  constructor(private readonly forms: WebFormsService) {}

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  show(@Param('id') id: string): Promise<OeffentlichesFormular> {
    return this.forms.publicView(id);
  }

  @Post(':id')
  @HttpCode(200)
  @UseGuards(ArbeitsnachweisGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    if (zuSchnell(req)) {
      return Promise.resolve({ ok: true });
    }

    const text = (key: string): string | null =>
      typeof body[key] === 'string' ? (body[key] as string) : null;

    const anfrage: Anfrage = {
      name: text('name') ?? '',
      email: text('email') ?? '',
      company: text('company'),
      phone: text('phone'),
      message: text('message'),
      consent: body.consent === true,
      website: text('website'),
    };

    return this.forms.submit(id, anfrage);
  }
}
