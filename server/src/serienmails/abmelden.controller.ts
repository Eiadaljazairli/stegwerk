import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Repository } from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type AbmeldeDaten, leseAbmeldeToken } from './abmelde-token';
import { SerienmailsService } from './serienmails.service';

const verdeckt = (email: string): string => {
  const [lokal, domain] = email.split('@');

  if (lokal === undefined || domain === undefined) {
    return email;
  }

  return `${lokal.slice(0, 2)}${'•'.repeat(Math.max(lokal.length - 2, 1))}@${domain}`;
};

@Controller('public/abmelden')
@UseGuards(ThrottlerGuard)
export class AbmeldenController {
  constructor(
    private readonly service: SerienmailsService,
    private readonly config: ConfigService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  private daten(token: string): AbmeldeDaten {
    const daten = leseAbmeldeToken(
      token,
      this.config.getOrThrow<string>('jwtSecret'),
    );

    if (daten === null) {
      throw new BadRequestException('Dieser Abmeldelink ist ungültig.');
    }

    return daten;
  }

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async zeigen(
    @Param('token') token: string,
  ): Promise<{ email: string; thema: string; absender: string }> {
    const daten = this.daten(token);
    const bereich = await this.workspaces.findOne({
      where: { id: daten.workspaceId },
    });

    return {
      email: verdeckt(daten.email),
      thema: daten.thema,
      absender: bereich?.name ?? '',
    };
  }

  @Post(':token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async abmelden(
    @Param('token') token: string,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<{ ok: true }> {
    await this.service.abmelden(this.daten(token), body?.alles === true);

    return { ok: true };
  }
}
