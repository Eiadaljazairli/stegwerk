import { BadRequestException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';

import { OAuthFehler, type OAuthService } from '../oauth/oauth.service';
import { MailboxUnreachableError } from './imap-reader';
import { type MailboxEntity } from './mailbox.entity';
import { mailSchluessel, open } from './secret-box';
import { type Versandzugang } from './smtp-sender';

export const postfachAnmeldung = async (
  mailbox: MailboxEntity,
  config: ConfigService,
  oauth: OAuthService | undefined,
): Promise<{ password: string; accessToken?: string }> => {
  if (mailbox.oauthZugangId === null || mailbox.oauthZugangId === undefined) {
    return {
      password: open(mailbox.passwordSealed, mailSchluessel(config)),
    };
  }

  if (oauth === undefined) {
    throw new MailboxUnreachableError(
      'Die Anmeldung über den Anbieter ist auf diesem Server nicht eingerichtet.',
    );
  }

  try {
    return {
      password: '',
      accessToken: await oauth.zugriffstoken(mailbox.oauthZugangId),
    };
  } catch (fehler) {
    throw new MailboxUnreachableError(
      fehler instanceof OAuthFehler
        ? fehler.message
        : 'Der Anbieter war nicht erreichbar.',
    );
  }
};

export const versandzugang = async (
  mailbox: MailboxEntity,
  config: ConfigService,
  oauth: OAuthService | undefined,
): Promise<Versandzugang> => {
  let anmeldung: { password: string; accessToken?: string };

  try {
    anmeldung = await postfachAnmeldung(mailbox, config, oauth);
  } catch (fehler) {
    if (fehler instanceof MailboxUnreachableError) {
      throw new BadRequestException(fehler.message);
    }

    throw fehler;
  }

  return {
    host: mailbox.smtpHost ?? '',
    port: mailbox.smtpPort ?? 587,
    secure: mailbox.smtpSecure,
    user: mailbox.username,
    passwort: anmeldung.password,
    ...(anmeldung.accessToken === undefined
      ? {}
      : { zugriffstoken: anmeldung.accessToken }),
  };
};
