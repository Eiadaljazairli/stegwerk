import { createHash } from 'node:crypto';

const SELBST = "'self'";

export const inlineScriptHashes = (html: string): string[] => {
  const hashes: string[] = [];
  const muster = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;

  for (const treffer of html.matchAll(muster)) {
    const attribute = treffer[1] ?? '';

    if (/\bsrc\s*=/iu.test(attribute)) {
      continue;
    }

    if (/\btype\s*=\s*["']application\/ld\+json["']/iu.test(attribute)) {
      continue;
    }

    const inhalt = treffer[2] ?? '';

    if (inhalt.trim() === '') {
      continue;
    }

    const hash = createHash('sha256').update(inhalt, 'utf8').digest('base64');

    hashes.push(`'sha256-${hash}'`);
  }

  return hashes;
};

export const originOf = (url: string | undefined): string | undefined => {
  if (url === undefined || url.trim() === '') {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

export type SecurityHeaderOptions = {
  scriptHashes?: string[];
  connectSources?: string[];
  hsts?: boolean;
  einbettbar?: boolean;
};

export const contentSecurityPolicy = ({
  scriptHashes = [],
  connectSources = [],
  einbettbar = false,
}: SecurityHeaderOptions = {}): string => {
  const direktiven: [string, string[]][] = [
    ['default-src', [SELBST]],

    ['script-src', [SELBST, ...scriptHashes]],

    ['style-src', [SELBST, "'unsafe-inline'"]],

    ['img-src', [SELBST, 'data:']],
    ['font-src', [SELBST]],

    ['connect-src', [SELBST, ...connectSources]],

    ['worker-src', [SELBST]],

    ['frame-ancestors', einbettbar ? ['https:'] : ["'none'"]],
    ['frame-src', ["'none'"]],
    ['object-src', ["'none'"]],

    ['base-uri', [SELBST]],
    ['form-action', [SELBST]],
  ];

  return direktiven
    .map(([name, werte]) => `${name} ${werte.join(' ')}`)
    .join('; ');
};

export const securityHeaders = (
  options: SecurityHeaderOptions = {},
): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Security-Policy': contentSecurityPolicy(options),

    'X-Content-Type-Options': 'nosniff',

    'Referrer-Policy': 'same-origin',

    'Permissions-Policy':
      'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',

    'Cross-Origin-Opener-Policy': 'same-origin',
  };

  if (options.einbettbar !== true) {
    headers['X-Frame-Options'] = 'DENY';
  }

  if (options.hsts === true) {
    headers['Strict-Transport-Security'] =
      'max-age=31536000; includeSubDomains';
  }

  return headers;
};
