import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PRAEFIX = 'swk';

const KENNUNG_ZEICHEN = 8;

const GEHEIMNIS_ZEICHEN = 43;

export type NeuerSchluessel = {
  token: string;
  kennung: string;
  hash: string;
};

export type Zerlegt = { kennung: string; geheimnis: string };

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const base62 = (laenge: number): string => {
  let ergebnis = '';

  while (ergebnis.length < laenge) {
    for (const byte of randomBytes(laenge * 2)) {
      if (byte < 248 && ergebnis.length < laenge) {
        ergebnis += ALPHABET[byte % 62];
      }
    }
  }

  return ergebnis;
};

export const hashe = (geheimnis: string): string =>
  createHash('sha256').update(geheimnis, 'utf8').digest('hex');

export const neuerSchluessel = (): NeuerSchluessel => {
  const kennung = base62(KENNUNG_ZEICHEN);
  const geheimnis = base62(GEHEIMNIS_ZEICHEN);

  return {
    token: `${PRAEFIX}_${kennung}_${geheimnis}`,
    kennung,
    hash: hashe(geheimnis),
  };
};

export const zerlege = (token: string): Zerlegt | null => {
  const teile = token.trim().split('_');

  if (teile.length !== 3) {
    return null;
  }

  const [praefix, kennung, geheimnis] = teile;

  if (praefix !== PRAEFIX) {
    return null;
  }

  if (!/^[A-Za-z0-9]{4,64}$/u.test(kennung)) {
    return null;
  }

  if (!/^[A-Za-z0-9]{32,128}$/u.test(geheimnis)) {
    return null;
  }

  return { kennung, geheimnis };
};

export const passt = (geheimnis: string, hash: string): boolean => {
  const errechnet = Buffer.from(hashe(geheimnis), 'utf8');
  const gespeichert = Buffer.from(hash, 'utf8');

  if (errechnet.length !== gespeichert.length) {
    return false;
  }

  return timingSafeEqual(errechnet, gespeichert);
};

export const anzeige = (kennung: string): string =>
  `${PRAEFIX}_${kennung}_${'•'.repeat(8)}`;
