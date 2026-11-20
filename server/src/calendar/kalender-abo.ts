import { createHmac, timingSafeEqual } from 'node:crypto';

const ZWECK = 'stegwerk:kalender-abo:v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const signatur = (
  geheimnis: string,
  membershipId: string,
  nonce: string,
): string =>
  createHmac('sha256', geheimnis)
    .update(`${ZWECK}\n${membershipId}\n${nonce}`)
    .digest('base64url');

export const aboToken = (
  geheimnis: string,
  membershipId: string,
  nonce: string,
): string => `${membershipId}.${signatur(geheimnis, membershipId, nonce)}`;

export const zerlegeAboToken = (
  token: string,
): { membershipId: string; signatur: string } | null => {
  const ohneEndung = token.replace(/\.ics$/u, '');
  const [membershipId, sig, ...rest] = ohneEndung.split('.');

  if (
    rest.length > 0 ||
    membershipId === undefined ||
    sig === undefined ||
    !UUID.test(membershipId) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(sig)
  ) {
    return null;
  }

  return { membershipId, signatur: sig };
};

export const aboSignaturStimmt = (
  geheimnis: string,
  membershipId: string,
  nonce: string | null,
  erhalten: string,
): boolean => {
  if (nonce === null) {
    return false;
  }

  const erwartet = Buffer.from(signatur(geheimnis, membershipId, nonce));
  const gegeben = Buffer.from(erhalten);

  return (
    erwartet.length === gegeben.length && timingSafeEqual(erwartet, gegeben)
  );
};
