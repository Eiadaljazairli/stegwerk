export type VorschauArt = 'pdf' | 'bild' | 'office';

const ENDUNGEN: Record<string, VorschauArt> = {
  pdf: 'pdf',
  png: 'bild',
  jpg: 'bild',
  jpeg: 'bild',
  gif: 'bild',
  webp: 'bild',
  doc: 'office',
  docx: 'office',
  xls: 'office',
  xlsx: 'office',
  ppt: 'office',
  pptx: 'office',
  odt: 'office',
  ods: 'office',
  odp: 'office',
};

export const vorschauArt = (name: string): VorschauArt | null => {
  const punkt = name.lastIndexOf('.');

  if (punkt < 0) {
    return null;
  }

  return ENDUNGEN[name.slice(punkt + 1).toLowerCase()] ?? null;
};

const beginntMit = (bytes: Uint8Array, kopf: number[], ab = 0): boolean =>
  kopf.every((wert, index) => bytes[ab + index] === wert);

export const istPdf = (bytes: Uint8Array): boolean =>
  beginntMit(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);

export const bildTyp = (bytes: Uint8Array): string | null => {
  if (beginntMit(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (beginntMit(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (beginntMit(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }

  if (
    beginntMit(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    beginntMit(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
};

export const alsDataUrl = (bytes: Uint8Array, typ: string): string => {
  let binaer = '';
  const block = 0x8000;

  for (let start = 0; start < bytes.length; start += block) {
    binaer += String.fromCharCode(...bytes.subarray(start, start + block));
  }

  return `data:${typ};base64,${btoa(binaer)}`;
};
