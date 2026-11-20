import {
  domainOf,
  isPublicDomain,
  normaliseAddress,
  parseAddressList,
} from './address-match';

type Beteiligte = {
  from?: string | null;
  to?: string | null;
  cc?: string | null;
};

const alleAdressen = (nachricht: Beteiligte): string[] =>
  [
    normaliseAddress(nachricht.from ?? ''),
    ...parseAddressList(nachricht.to ?? null),
    ...parseAddressList(nachricht.cc ?? null),
  ].filter((adresse) => adresse !== '');

export const teamDomains = (adressen: Iterable<string>): Set<string> => {
  const domains = new Set<string>();

  for (const adresse of adressen) {
    const domain = domainOf(normaliseAddress(adresse));

    if (domain !== '' && !isPublicDomain(domain)) {
      domains.add(domain);
    }
  }

  return domains;
};

export const istIntern = (
  nachricht: Beteiligte,
  domains: ReadonlySet<string>,
): boolean => {
  if (domains.size === 0) {
    return false;
  }

  const adressen = alleAdressen(nachricht);

  return (
    adressen.length > 0 &&
    adressen.every((adresse) => domains.has(domainOf(adresse)))
  );
};

export const istEinladung = (kalender: string | null | undefined): boolean =>
  kalender !== null &&
  kalender !== undefined &&
  /^METHOD:[A-Z]+/imu.test(kalender);

const ABMELDEN =
  /(?<![a-z])(unsubscribe|unsub|opt[._-]?out|abmelden)(?![a-z])/u;

const abmeldeAdresse = (adresse: string): boolean => {
  const at = adresse.lastIndexOf('@');

  if (ABMELDEN.test(at === -1 ? adresse : adresse.slice(0, at))) {
    return true;
  }

  const labels = adresse.slice(at + 1).split('.');

  return labels.slice(0, -2).some((label) => ABMELDEN.test(label));
};

export const istAbmeldung = (
  nachricht: Beteiligte & { subject?: string | null },
  eigeneAdresse: string,
): boolean => {
  const gegenueber = alleAdressen(nachricht).filter(
    (adresse) => adresse !== eigeneAdresse,
  );

  if (gegenueber.length === 0) {
    return false;
  }

  if (gegenueber.every(abmeldeAdresse)) {
    return true;
  }

  const betreff = (nachricht.subject ?? '').trim().toLowerCase();

  return (
    normaliseAddress(nachricht.from ?? '') === eigeneAdresse &&
    gegenueber.length === 1 &&
    (betreff === 'unsubscribe' || betreff === 'abmelden')
  );
};

const GRUPPE =
  /^(info|contact|kontakt|hello|hallo|support|feedback|service|help|hilfe|invites?|welcome|alerts?|team|notifications?|news|anfrage|anfragen|office|buero|büro|mail|post|zentrale)([+._-].*)?@/iu;

export const istGruppenadresse = (adresse: string): boolean =>
  GRUPPE.test(normaliseAddress(adresse));

export const istVonGruppenadresse = (
  nachricht: Beteiligte,
  eigene: ReadonlySet<string>,
): boolean => {
  const von = normaliseAddress(nachricht.from ?? '');

  return von !== '' && !eigene.has(von) && istGruppenadresse(von);
};

export const istNurFreemail = (
  nachricht: Beteiligte,
  eigene: ReadonlySet<string>,
): boolean => {
  const andere = alleAdressen(nachricht).filter(
    (adresse) => !eigene.has(adresse),
  );

  return (
    andere.length > 0 &&
    andere.every((adresse) => isPublicDomain(domainOf(adresse)))
  );
};
