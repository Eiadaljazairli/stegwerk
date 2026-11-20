export const normaliseAddress = (raw: string): string => {
  const angled = /<([^>]*)>/u.exec(raw);
  const bare = (angled === null ? raw : angled[1]).trim().toLowerCase();

  return bare.includes('@') ? bare : '';
};

export const parseAddressList = (
  header: string | null | undefined,
): string[] => {
  if (header === null || header === undefined || header.trim() === '') {
    return [];
  }

  const found: string[] = [];

  let current = '';
  let inQuotes = false;

  for (const character of header) {
    if (character === '"') {
      inQuotes = !inQuotes;
      current += character;
    } else if (character === ',' && !inQuotes) {
      found.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  found.push(current);

  return [
    ...new Set(
      found
        .map((entry) => normaliseAddress(entry))
        .filter((entry) => entry !== ''),
    ),
  ];
};

export const domainOf = (address: string): string => {
  const at = address.lastIndexOf('@');

  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
};

const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'outlook.com',
  'outlook.de',
  'hotmail.com',
  'hotmail.de',
  'live.com',
  'live.de',
  'yahoo.com',
  'yahoo.de',
  'icloud.com',
  'me.com',
  'posteo.de',
  'mailbox.org',
  'freenet.de',
  'aol.com',
  'protonmail.com',
  'proton.me',
]);

export const isPublicDomain = (domain: string): boolean =>
  PUBLIC_DOMAINS.has(domain.toLowerCase());

export type Matchable = {
  contactsByEmail: Map<string, { id: string; companyId: string | null }>;
  companiesByDomain: Map<string, string>;
};

export type MessageAddresses = {
  from: string | null;
  to: string | null;
  cc: string | null;
};

export type Match = {
  contactId: string | null;
  companyId: string | null;
  matchedOn: string | null;
};

export const matchMessage = (
  addresses: MessageAddresses,
  known: Matchable,
): Match => {
  const ordered = [
    ...parseAddressList(addresses.from),
    ...parseAddressList(addresses.to),
    ...parseAddressList(addresses.cc),
  ];

  for (const address of ordered) {
    const contact = known.contactsByEmail.get(address);

    if (contact !== undefined) {
      return {
        contactId: contact.id,
        companyId: contact.companyId,
        matchedOn: address,
      };
    }
  }

  for (const address of ordered) {
    const domain = domainOf(address);

    if (domain === '' || isPublicDomain(domain)) {
      continue;
    }

    const companyId = known.companiesByDomain.get(domain);

    if (companyId !== undefined) {
      return { contactId: null, companyId, matchedOn: address };
    }
  }

  return { contactId: null, companyId: null, matchedOn: null };
};
