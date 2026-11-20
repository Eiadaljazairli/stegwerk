import { domainOf, normaliseAddress, parseAddressList } from './address-match';
import { kopfzeilenSicher } from './outbound-mail';

export const MAX_SPERREN = 500;

export const normalisiereSperre = (roh: string): string | null => {
  if (!kopfzeilenSicher(roh)) {
    return null;
  }

  const sauber = roh.trim().toLowerCase();

  if (sauber.length === 0 || sauber.length > 320) {
    return null;
  }

  if (sauber.startsWith('@')) {
    const domain = sauber.slice(1);

    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(domain) ? `@${domain}` : null;
  }

  const adresse = normaliseAddress(sauber);

  return /^[^\s@,<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(adresse)
    ? adresse
    : null;
};

export const adresseGesperrt = (
  adresse: string,
  sperren: ReadonlySet<string>,
): boolean => {
  const sauber = normaliseAddress(adresse);

  if (sauber === '') {
    return false;
  }

  return sperren.has(sauber) || sperren.has(`@${domainOf(sauber)}`);
};

export const nachrichtGesperrt = (
  nachricht: { from: string | null; to: string | null; cc: string | null },
  sperren: ReadonlySet<string>,
  eigeneAdresse: string,
): boolean => {
  if (sperren.size === 0) {
    return false;
  }

  const beteiligte = [
    ...parseAddressList(nachricht.from),
    ...parseAddressList(nachricht.to),
    ...parseAddressList(nachricht.cc),
  ].filter((adresse) => adresse !== eigeneAdresse);

  return beteiligte.some((adresse) => adresseGesperrt(adresse, sperren));
};
