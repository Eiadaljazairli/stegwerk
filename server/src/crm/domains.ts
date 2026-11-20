import { BadRequestException } from '@nestjs/common';

import { isPublicDomain } from '../mailboxes/address-match';

export const MAX_ZWEITDOMAINS = 10;

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

export const domainVon = (wert: string | null | undefined): string | null => {
  const roh = (wert ?? '').trim().toLowerCase();

  if (roh === '') {
    return null;
  }

  return roh
    .replace(/^[a-z]+:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[/?#].*$/u, '')
    .replace(/:\d+$/u, '');
};

export const bereinigeZweitdomains = (
  liste: readonly string[],
  hauptdomain: string | null | undefined,
  { still = false }: { still?: boolean } = {},
): string[] => {
  const haupt = domainVon(hauptdomain);
  const ergebnis: string[] = [];

  for (const eintrag of liste) {
    const domain = domainVon(eintrag);

    if (domain === null || domain === haupt || ergebnis.includes(domain)) {
      continue;
    }

    if (still && (!DOMAIN.test(domain) || isPublicDomain(domain))) {
      continue;
    }

    if (!DOMAIN.test(domain)) {
      throw new BadRequestException(`„${eintrag}“ ist keine Domain.`);
    }

    if (isPublicDomain(domain)) {
      throw new BadRequestException(
        `„${domain}“ ist ein allgemeiner Mail-Anbieter und gehört zu keiner Firma.`,
      );
    }

    ergebnis.push(domain);
  }

  if (still) {
    return ergebnis.slice(0, MAX_ZWEITDOMAINS);
  }

  if (ergebnis.length > MAX_ZWEITDOMAINS) {
    throw new BadRequestException(
      `Eine Firma hat höchstens ${MAX_ZWEITDOMAINS} weitere Domains.`,
    );
  }

  return ergebnis;
};
