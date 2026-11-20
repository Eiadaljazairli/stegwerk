import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';

import { ArbeitsnachweisService, MINDESTZEIT_MS } from './arbeitsnachweis';

export const NACHWEIS_KOPF = 'x-arbeitsnachweis';

type MitNachweis = Request & { arbeitsnachweisAusgestellt?: Date };

const MELDUNG: Record<string, string> = {
  fehlt:
    'Die Sicherheitsprüfung fehlt. Bitte laden Sie die Seite neu und versuchen Sie es noch einmal.',
  ungueltig:
    'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es noch einmal.',
  abgelaufen:
    'Die Sicherheitsprüfung ist abgelaufen. Bitte versuchen Sie es noch einmal.',
  verbraucht:
    'Diese Sicherheitsprüfung wurde schon benutzt. Bitte versuchen Sie es noch einmal.',
};

@Injectable()
export class ArbeitsnachweisGuard implements CanActivate {
  constructor(private readonly nachweis: ArbeitsnachweisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: MitNachweis =
      context.getType<string>() === 'graphql'
        ? (
            GqlExecutionContext.create(context).getContext() as {
              req: MitNachweis;
            }
          ).req
        : context.switchToHttp().getRequest<MitNachweis>();
    const kopf = req.headers[NACHWEIS_KOPF];
    const einloesung = await this.nachweis.einloesen(
      Array.isArray(kopf) ? kopf[0] : kopf,
    );

    if (einloesung.ergebnis !== 'ok') {
      throw new BadRequestException(MELDUNG[einloesung.ergebnis]);
    }

    req.arbeitsnachweisAusgestellt = einloesung.ausgestellt;

    return true;
  }
}

export const zuSchnell = (req: Request, jetzt = new Date()): boolean => {
  const ausgestellt = (req as MitNachweis).arbeitsnachweisAusgestellt;

  return (
    ausgestellt !== undefined &&
    jetzt.getTime() - ausgestellt.getTime() < MINDESTZEIT_MS
  );
};
