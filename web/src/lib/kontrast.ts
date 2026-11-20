export const leuchtdichte = (farbe: string): number => {
  const hex = farbe.trim().replace(/^#/u, '');
  const voll =
    hex.length === 3
      ? hex
          .split('')
          .map((z) => z + z)
          .join('')
      : hex;

  if (!/^[0-9a-f]{6}$/iu.test(voll)) {
    throw new Error(`Keine Hex-Farbe: ${farbe}`);
  }

  const kanal = (i: number): number => {
    const c = Number.parseInt(voll.slice(i, i + 2), 16) / 255;

    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
};

export const kontrast = (a: string, b: string): number => {
  const [dunkel, hell] = [leuchtdichte(a), leuchtdichte(b)].sort(
    (x, y) => x - y,
  );

  return (hell + 0.05) / (dunkel + 0.05);
};

export type Token = Record<string, string>;

export const tokenAus = (css: string, kopf: string, nach = ''): Token => {
  const ab = nach === '' ? 0 : css.indexOf(nach);

  if (ab < 0) {
    throw new Error(`Stelle fehlt: ${nach}`);
  }

  const start = css.indexOf(`${kopf} {`, ab);

  if (start < 0) {
    throw new Error(`Block fehlt: ${kopf}`);
  }

  const ende = css.indexOf('}', start);
  const block = css.slice(start, ende);
  const token: Token = {};

  for (const treffer of block.matchAll(
    /--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/giu,
  )) {
    token[treffer[1]] = treffer[2].toLowerCase();
  }

  return token;
};
