import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';

import { runWithRequestContext } from './request-context';
import { geraetAus, kuerzeIp } from './geraet';

const HEADER = 'x-request-id';
const TAB = 'x-stegwerk-tab';

const TAB_FORM = /^[A-Za-z0-9-]{8,64}$/u;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.headers[HEADER];
    const requestId =
      typeof incoming === 'string' && incoming !== '' ? incoming : randomUUID();

    response.setHeader(HEADER, requestId);

    const tab = request.headers[TAB];

    runWithRequestContext(
      {
        requestId,
        geraet: geraetAus(request.headers['user-agent']),
        ipGekuerzt: kuerzeIp(request.ip),
        ...(typeof tab === 'string' && TAB_FORM.test(tab) ? { tab } : {}),
      },
      () => next(),
    );
  }
}
