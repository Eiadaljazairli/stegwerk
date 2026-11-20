const PALETTE_SIZE = 8;

const hueIndex = (seed: string): number => {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.codePointAt(0)!) % 100_003;
  }

  return hash % PALETTE_SIZE;
};

export const initialsOf = (name: string): string => {
  const words = name
    .split(/\s+/u)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '');

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

export const Avatar = ({
  name,
  size = 'md',
  bild,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  bild?: string | null;
}) =>
  bild != null && bild.startsWith('data:image/') ? (
    <span className={`avatar avatar--${size} avatar--bild`} aria-hidden="true">
      <img src={bild} alt="" />
    </span>
  ) : (
    <span
      className={`avatar avatar--${size} avatar--tone-${String(hueIndex(name))}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
