import { BadRequestException } from '@nestjs/common';
import { domainToASCII } from 'node:url';

export const MAX_EINLADUNGS_DOMAINS = 20;

const DOMAIN =
  /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const alsAscii = (domain: string): string => domainToASCII(domain) || domain;

export const normalisiereDomains = (eingabe: readonly string[]): string[] => {
  const domains = [
    ...new Set(
      eingabe
        .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ''))
        .filter((domain) => domain !== '')
        .map(alsAscii),
    ),
  ];

  if (domains.length > MAX_EINLADUNGS_DOMAINS) {
    throw new BadRequestException(
      `Höchstens ${MAX_EINLADUNGS_DOMAINS} Domains.`,
    );
  }

  const falsch = domains.find((domain) => !DOMAIN.test(domain));

  if (falsch !== undefined) {
    throw new BadRequestException(
      `„${falsch.slice(0, 80)}“ ist keine Domain. Gemeint ist der Teil hinter dem @, etwa beispiel.de.`,
    );
  }

  return domains;
};

export const domainVon = (email: string): string =>
  alsAscii(email.trim().toLowerCase().split('@').pop() ?? '');

export const adresseErlaubt = (
  email: string,
  domains: readonly string[],
): boolean => {
  if (domains.length === 0) {
    return true;
  }

  const domain = domainVon(email);

  return domains.some(
    (erlaubt) => domain === erlaubt || domain.endsWith(`.${erlaubt}`),
  );
};

export const DOMAIN_NICHT_ERLAUBT = 'DOMAIN_NICHT_ERLAUBT';

export const pruefeEinladungsDomain = (
  email: string,
  domains: readonly string[],
): void => {
  if (!adresseErlaubt(email, domains)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: `In diesen Arbeitsbereich darf nur eingeladen werden, wer eine Adresse bei ${domains.join(', ')} hat.`,
      reason: DOMAIN_NICHT_ERLAUBT,
    });
  }
};
