export const SCHREIBMODI = ['direkt', 'vorschlag'] as const;

export type Schreibmodus = (typeof SCHREIBMODI)[number];

export const wirksameRechte = (
  permissions: readonly string[],
  schreibmodus: Schreibmodus,
): string[] =>
  schreibmodus === 'vorschlag'
    ? permissions.filter((recht) => recht.endsWith(':view'))
    : [...permissions];
