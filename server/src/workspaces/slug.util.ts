const GERMAN_TRANSLITERATIONS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => GERMAN_TRANSLITERATIONS[char] ?? char)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
