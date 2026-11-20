export const LOGO_MAX_BYTES = 1024 * 1024;

export type LogoArt = 'image/png' | 'image/jpeg';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const beginntMit = (bytes: Buffer, kopf: number[]): boolean =>
  bytes.length >= kopf.length && kopf.every((wert, i) => bytes[i] === wert);

export const logoArt = (bytes: Buffer): LogoArt | null => {
  if (beginntMit(bytes, PNG)) {
    return 'image/png';
  }

  if (beginntMit(bytes, JPEG)) {
    return 'image/jpeg';
  }

  return null;
};

export const logoFehler = (bytes: Buffer): string | null => {
  if (bytes.length === 0) {
    return 'Die Datei ist leer.';
  }

  if (bytes.length > LOGO_MAX_BYTES) {
    return 'Das Logo ist größer als 1 MB.';
  }

  if (logoArt(bytes) === null) {
    return 'Bitte ein Logo als PNG oder JPEG hochladen.';
  }

  return null;
};

export const logoDataUrl = (
  logo: Buffer | null,
  mime: string | null,
): string | null =>
  logo === null || mime === null
    ? null
    : `data:${mime};base64,${logo.toString('base64')}`;
