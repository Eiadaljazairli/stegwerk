export const API_PREFIXES = [
  'graphql',
  'attachments',
  'health',
  'billing',
  'quotes',
  'invoices',
  'appointments',
  'export',
  'public',
  'live',
];

const LIEFERNDE_METHODEN = ['GET', 'HEAD'];

export const servesInterface = (method: string, path: string): boolean => {
  if (!LIEFERNDE_METHODEN.includes(method)) {
    return false;
  }

  const erstes = path.split('/')[1] ?? '';

  return !API_PREFIXES.includes(erstes);
};

export const VORGERENDERTE_BEREICHE = [
  'funktionen',
  'entwickler',
  'hilfe/fehlerbehebung',
];

const VORGERENDERT = new RegExp(
  `^/((?:${VORGERENDERTE_BEREICHE.join('|')})(?:/[a-z0-9-]+)?)/?$`,
  'u',
);

export const vorgerenderteDatei = (path: string): string | null => {
  if (path === '/') {
    return 'start.html';
  }

  const treffer = VORGERENDERT.exec(path);

  return treffer === null ? null : `${treffer[1]}/index.html`;
};
