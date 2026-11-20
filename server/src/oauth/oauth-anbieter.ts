export const OAUTH_ANBIETER = ['google', 'microsoft'] as const;

export type OAuthAnbieter = (typeof OAUTH_ANBIETER)[number];

export const OAUTH_ZWECKE = ['postfach', 'kalender'] as const;

export type OAuthZweck = (typeof OAUTH_ZWECKE)[number];

export const POSTFACH_VORGANG_ARTEN = ['weiteres', 'gemeinsam'] as const;

export type PostfachVorgangArt = (typeof POSTFACH_VORGANG_ARTEN)[number];

export type AnbieterZugang = {
  clientId: string;
  clientSecret: string;
  tenant?: string;
};

export type AnbieterDaten = {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  scopes: Record<OAuthZweck, string[]>;
  extra: Record<string, string>;
};

export const mandant = (roh: string | undefined): string =>
  roh !== undefined && /^[A-Za-z0-9.-]{1,100}$/u.test(roh) ? roh : 'common';

export const anbieterDaten = (
  anbieter: OAuthAnbieter,
  tenant?: string,
): AnbieterDaten => {
  if (anbieter === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      scopes: {
        postfach: ['openid', 'email', 'https://mail.google.com/'],
        kalender: [
          'openid',
          'email',
          'https://www.googleapis.com/auth/calendar',
        ],
      },
      extra: { access_type: 'offline', prompt: 'consent' },
    };
  }

  const basis = `https://login.microsoftonline.com/${mandant(tenant)}/oauth2/v2.0`;

  return {
    authUrl: `${basis}/authorize`,
    tokenUrl: `${basis}/token`,
    revokeUrl: null,
    scopes: {
      postfach: [
        'openid',
        'email',
        'offline_access',
        'https://outlook.office.com/IMAP.AccessAsUser.All',
        'https://outlook.office.com/SMTP.Send',
      ],
      kalender: [
        'openid',
        'email',
        'offline_access',
        'https://graph.microsoft.com/Calendars.ReadWrite',
      ],
    },
    extra: { prompt: 'select_account' },
  };
};

export const POSTFACH_SERVER: Record<
  OAuthAnbieter,
  {
    imap: { host: string; port: number; secure: boolean };
    smtp: { host: string; port: number; secure: boolean };
  }
> = {
  google: {
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  },
  microsoft: {
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
  },
};

export const ERLAUBTE_HOSTS = new Set([
  'accounts.google.com',
  'oauth2.googleapis.com',
  'www.googleapis.com',
  'apidata.googleusercontent.com',
  'login.microsoftonline.com',
  'graph.microsoft.com',
]);

export const istErlaubterHost = (url: URL): boolean =>
  url.protocol === 'https:' && ERLAUBTE_HOSTS.has(url.hostname);
