import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { type Aufgabe, ArbeitsnachweisService } from './arbeitsnachweis';

@Controller('public/nachweis')
@UseGuards(ThrottlerGuard)
export class ArbeitsnachweisController {
  constructor(private readonly nachweis: ArbeitsnachweisService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  aufgabe(): Aufgabe {
    return this.nachweis.aufgabe();
  }
}
