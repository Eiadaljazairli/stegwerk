import { entitaetenLoesen } from './impressum';

export type BildArt =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/x-icon';

const beginntMit = (bytes: Buffer, kopf: number[], ab = 0): boolean =>
  bytes.length >= ab + kopf.length &&
  kopf.every((wert, i) => bytes[ab + i] === wert);

export const bildArt = (bytes: Buffer): BildArt | null => {
  if (beginntMit(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (beginntMit(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (
    beginntMit(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    beginntMit(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'image/gif';
  }

  if (
    beginntMit(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    beginntMit(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  if (
    beginntMit(bytes, [0x00, 0x00, 0x01, 0x00]) &&
    bytes.length >= 22 &&
    bytes.readUInt16LE(4) > 0
  ) {
    return 'image/x-icon';
  }

  return null;
};

type Kandidat = { url: URL; rang: number; groesse: number };

const attribut = (tag: string, name: string): string | null => {
  const treffer = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'iu',
  ).exec(tag);
  const wert = treffer?.[1] ?? treffer?.[2] ?? treffer?.[3];

  return wert === undefined ? null : entitaetenLoesen(wert.trim());
};

const kante = (sizes: string | null): number =>
  Math.max(
    0,
    ...[...(sizes ?? '').matchAll(/(\d{1,4})x(\d{1,4})/giu)].map((m) =>
      Math.max(Number(m[1]), Number(m[2])),
    ),
  );

export const logoKandidaten = (html: string, basis: URL): URL[] => {
  const kandidaten: Kandidat[] = [];
  const kopf = html.slice(0, 512 * 1024);
  const tags = kopf.match(/<(?:link|meta)\b[^<>]{0,2000}>/giu) ?? [];

  const dazu = (roh: string | null, rang: number, groesse = 0) => {
    if (roh === null || roh === '' || /^data:/iu.test(roh)) {
      return;
    }

    try {
      const url = new URL(roh, basis);

      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !/\.svgz?$/iu.test(url.pathname)
      ) {
        url.hash = '';
        kandidaten.push({ url, rang, groesse });
      }
    } catch {}
  };

  for (const tag of tags) {
    const rel = (attribut(tag, 'rel') ?? '').toLowerCase();
    const typ = (attribut(tag, 'type') ?? '').toLowerCase();

    if (tag.toLowerCase().startsWith('<link')) {
      if (typ.includes('svg')) {
        continue;
      }

      if (/\bapple-touch-icon(?:-precomposed)?\b/u.test(rel)) {
        dazu(attribut(tag, 'href'), 0, kante(attribut(tag, 'sizes')) || 180);
      } else if (/\bicon\b/u.test(rel)) {
        dazu(attribut(tag, 'href'), 1, kante(attribut(tag, 'sizes')));
      }

      continue;
    }

    const eigenschaft = (
      attribut(tag, 'property') ??
      attribut(tag, 'name') ??
      ''
    ).toLowerCase();

    if (eigenschaft === 'og:image' || eigenschaft === 'og:image:url') {
      dazu(attribut(tag, 'content'), 2);
    }
  }

  dazu('/favicon.ico', 3);

  const gesehen = new Set<string>();

  return kandidaten
    .sort((a, b) => a.rang - b.rang || b.groesse - a.groesse)
    .filter((kandidat) => {
      const schluessel = kandidat.url.toString();

      if (gesehen.has(schluessel)) {
        return false;
      }

      gesehen.add(schluessel);

      return true;
    })
    .slice(0, 5)
    .map((kandidat) => kandidat.url);
};

export const bildDataUrl = (bild: Buffer, mime: string): string =>
  `data:${mime};base64,${bild.toString('base64')}`;
