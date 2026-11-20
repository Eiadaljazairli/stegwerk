import { randomBytes } from 'node:crypto';

const BYTES = 8;

const STELLEN = BYTES * 2;

const GRUPPE = 4;

const gruppieren = (zeichen: string): string =>
  zeichen.replace(new RegExp(`(.{${GRUPPE}})(?=.)`, 'gu'), '$1-');

export const neuerCode = (): string =>
  gruppieren(randomBytes(BYTES).toString('hex'));

export const normalisieren = (eingabe: string): string | null => {
  const zeichen = eingabe.toLowerCase().replace(/[^0-9a-f]/gu, '');

  return zeichen.length === STELLEN ? gruppieren(zeichen) : null;
};

export const SALT_ROUNDS = 8;
