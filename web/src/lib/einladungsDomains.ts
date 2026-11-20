export const domainsAusText = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((teil) => teil.trim().toLowerCase().replace(/^@+/, ''))
      .filter((teil) => teil !== ''),
  ),
];

export const domainsAlsText = (domains: readonly string[]): string =>
  domains.join(', ');

export const eigeneDomainFehlt = (
  email: string,
  domains: readonly string[],
): boolean => {
  if (domains.length === 0) {
    return false;
  }

  const eigene = email.trim().toLowerCase().split('@').pop() ?? '';

  return !domains.some(
    (domain) => eigene === domain || eigene.endsWith(`.${domain}`),
  );
};
