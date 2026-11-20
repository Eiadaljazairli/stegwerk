import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request, type Response } from 'express';

import { KalenderSyncService } from '../kalender-sync/kalender-sync.service';
import { MailboxUnreachableError } from '../mailboxes/imap-reader';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { type OAuthZweck } from './oauth-anbieter';
import { OAUTH_COOKIE, oauthCookieOptionen } from './oauth.resolver';
import {
  type AbgeschlossenerVorgang,
  OAuthFehler,
  OAuthService,
} from './oauth.service';

const ZIEL: Record<OAuthZweck, string> = {
  postfach: '/postfach',
  kalender: '/kalender',
};

const liesCookie = (anfrage: Request, name: string): string | null => {
  for (const teil of (anfrage.headers.cookie ?? '').split(';')) {
    const [schluessel, ...wert] = teil.trim().split('=');

    if (schluessel === name && wert.length > 0) {
      try {
        return decodeURIComponent(wert.join('='));
      } catch {
        return null;
      }
    }
  }

  return null;
};

const grundFuer = (fehler: unknown): string =>
  fehler instanceof OAuthFehler ||
  fehler instanceof MailboxUnreachableError ||
  fehler instanceof BadRequestException
    ? fehler.message
    : 'Das Verbinden ist fehlgeschlagen. Bitte noch einmal versuchen.';

@Controller('oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly mailboxes: MailboxesService,
    private readonly kalender: KalenderSyncService,
    private readonly config: ConfigService,
  ) {}

  private zurueck(
    antwort: Response,
    zweck: OAuthZweck | null,
    grund: string | null,
  ): void {
    const web = (this.config.get<string>('webOrigin') ?? '').replace(
      /\/+$/u,
      '',
    );
    const ziel = new URL(`${web}${ZIEL[zweck ?? 'postfach']}`);

    ziel.searchParams.set('oauth', grund === null ? 'ok' : 'fehler');

    if (grund !== null) {
      ziel.searchParams.set('grund', grund.slice(0, 200));
    }

    antwort.clearCookie(OAUTH_COOKIE, {
      ...oauthCookieOptionen(),
      maxAge: undefined,
    });
    antwort.redirect(303, ziel.toString());
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
      gueltigerState === null
        ? null
        : await this.oauth.zweckVon(gueltigerState);

    if (gueltigerState === null || typeof code !== 'string' || code === '') {
      if (gueltigerState !== null) {
        await this.oauth.verwerfen(gueltigerState);
      }

      this.zurueck(
        antwort,
        zweck,
        fehlerCode === 'access_denied'
          ? 'Die Anmeldung wurde beim Anbieter abgebrochen.'
          : 'Die Anmeldung beim Anbieter ist nicht zustande gekommen.',
      );

      return;
    }

    let vorgang: AbgeschlossenerVorgang | null = null;

    try {
      vorgang = await this.oauth.abschliessen({
        state: gueltigerState,
        code: code.slice(0, 4000),
        bindung: liesCookie(anfrage, OAUTH_COOKIE),
      });

      if (vorgang.zweck === 'postfach') {
        await this.mailboxes.oauthVerbinden(
          vorgang.workspaceId,
          vorgang.userId,
          {
            anbieter: vorgang.anbieter,
            zugangId: vorgang.zugang.id,
            konto: vorgang.zugang.konto,
            zugriff: vorgang.zugriff,
            postfachArt: vorgang.postfachArt,
          },
        );
      } else {
        await this.kalender.oauthVerbinden({
          workspaceId: vorgang.workspaceId,
          userId: vorgang.userId,
          anbieter: vorgang.anbieter,
          zugangId: vorgang.zugang.id,
          konto: vorgang.zugang.konto,
        });
      }

      this.zurueck(antwort, vorgang.zweck, null);
    } catch (fehler) {
      this.logger.warn(
        `Verbinden über OAuth fehlgeschlagen: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );

      if (vorgang !== null) {
        await this.oauth.entfernen(vorgang.zugang.id).catch(() => undefined);
      }

      this.zurueck(antwort, zweck, grundFuer(fehler));
    }
  }
}
