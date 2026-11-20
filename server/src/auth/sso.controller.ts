import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';

import { liesCookie } from './sitzungs-cookie';
import {
  SSO_COOKIE,
  SSO_EINLOESE_COOKIE,
  ssoCookieOptionen,
  ssoEinloeseCookieOptionen,
} from './sso.resolver';
import { SsoFehler, SsoService } from './sso.service';

@Controller('oauth/anmelden')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(private readonly sso: SsoService) {}

  private weiter(antwort: Response, ziel: string): void {
    antwort.clearCookie(SSO_COOKIE, {
      ...ssoCookieOptionen(),
      maxAge: undefined,
    });
    antwort.setHeader('Referrer-Policy', 'no-referrer');
    antwort.redirect(303, ziel);
  }

  @Get('rueckruf')
  async rueckruf(
    @Req() anfrage: Request,
    @Res() antwort: Response,
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') fehlerCode?: string,
  ): Promise<void> {
    const gueltigerState =
      typeof state === 'string' && /^[A-Za-z0-9_-]{20,100}$/u.test(state)
        ? state
        : null;
    const zweck =
      gueltigerState === null ? null : await this.sso.zweckVon(gueltigerState);

    if (gueltigerState === null || typeof code !== 'string' || code === '') {
      if (gueltigerState !== null) {
        await this.sso.verwerfen(gueltigerState);
      }

      this.weiter(
        antwort,
        this.sso.zielFuer(zweck, {
          fehler:
            fehlerCode === 'access_denied' ? 'abgebrochen' : 'nicht_zustande',
        }),
      );

      return;
    }

    try {
      const { ziel, einloesung } = await this.sso.abschliessen({
        state: gueltigerState,
        code: code.slice(0, 4000),
        bindung: liesCookie(anfrage, SSO_COOKIE),
      });

      if (einloesung !== null) {
        antwort.cookie(
          SSO_EINLOESE_COOKIE,
          einloesung,
          ssoEinloeseCookieOptionen(),
        );
      }

      this.weiter(antwort, ziel);
    } catch (fehler) {
      this.logger.warn(
        `Anmelden über Google/Microsoft fehlgeschlagen: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );
      this.weiter(
        antwort,
        this.sso.zielFuer(
          zweck,
          fehler instanceof SsoFehler
            ? { fehler: fehler.code, anbieter: fehler.anbieter }
            : { fehler: 'fehlgeschlagen' },
        ),
      );
    }
  }
}
