import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';

import { LiveService } from './live.service';

const HERZSCHLAG_MS = 25_000;
export const HOECHSTDAUER_MS = 15 * 60_000;
export const WECHSEL_FRIST_MS = 60_000;

@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  async strom(
    @Query('ticket') ticket: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    let abgebrochen = false;
    let aufraeumen = () => {
      abgebrochen = true;
    };

    request.on('close', () => aufraeumen());

    const wer =
      typeof ticket === 'string'
        ? await this.live.ticketEinloesen(ticket)
        : null;

    if (abgebrochen) {
      return;
    }

    if (wer === null) {
      response.status(401).json({
        message: 'Die Eintrittskarte ist ungültig oder abgelaufen.',
      });

      return;
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const schreiben = (text: string) => {
      if (!response.writableEnded) {
        response.write(text);
      }
    };
    const ereignis = (art: string, daten: unknown) =>
      schreiben(`event: ${art}\ndata: ${JSON.stringify(daten)}\n\n`);

    let abmelden: () => void = () => undefined;
    const herzschlag = setInterval(() => schreiben(': da\n\n'), HERZSCHLAG_MS);
    let ende: ReturnType<typeof setTimeout> = setTimeout(() => {
      ereignis('wechsel', {});
      ende = setTimeout(() => {
        aufraeumen();
        response.end();
      }, WECHSEL_FRIST_MS);
    }, HOECHSTDAUER_MS);

    aufraeumen = () => {
      clearInterval(herzschlag);
      clearTimeout(ende);
      abmelden();
    };

    abmelden = this.live.abonnieren({
      userId: wer.userId,
      workspaceId: wer.workspaceId,
      senden: (aenderungen) => ereignis('aenderungen', aenderungen),
      nachladen: () => ereignis('nachladen', {}),
      schliessen: (grund) => {
        if (grund === 'verdraengt') {
          ereignis('verdraengt', {});
        }

        aufraeumen();
        response.end();
      },
    });

    ereignis('bereit', {});
  }
}
