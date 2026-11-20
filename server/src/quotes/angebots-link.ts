import { createHmac, timingSafeEqual } from 'node:crypto';

const ZWECK = 'stegwerk:angebot-link:v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export const linkSignatur = (
  geheimnis: string,
  quoteId: string,
  nonce: string,
): string =>
  createHmac('sha256', geheimnis)
    .update(`${ZWECK}\n${quoteId}\n${nonce}`)
    .digest('base64url');

export const linkToken = (
  geheimnis: string,
  quoteId: string,
  nonce: string,
): string => `${quoteId}.${linkSignatur(geheimnis, quoteId, nonce)}`;

export const zerlegeToken = (
  token: string,
): { quoteId: string; signatur: string } | null => {
  const [quoteId, signatur, ...rest] = token.split('.');

  if (
    rest.length > 0 ||
    quoteId === undefined ||
    signatur === undefined ||
    !UUID.test(quoteId) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(signatur)
  ) {
    return null;
  }

  return { quoteId, signatur };
};

export const signaturStimmt = (
  geheimnis: string,
  quoteId: string,
  nonce: string | null,
  signatur: string,
): boolean => {
  if (nonce === null) {
    return false;
  }

  const erwartet = Buffer.from(linkSignatur(geheimnis, quoteId, nonce));
  const erhalten = Buffer.from(signatur);

  return (
    erwartet.length === erhalten.length && timingSafeEqual(erwartet, erhalten)
  );
};
