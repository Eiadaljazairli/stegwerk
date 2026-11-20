import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const PREFIX = 'v1';

const PREFIX_V2 = 'v2';

export type Schluesselbund = {
  primaer: Buffer;
  alte: Buffer[];
};

export const schluesselKennung = (key: Buffer): string =>
  createHash('sha256').update(key).digest('hex').slice(0, 8);

const alsBund = (key: Buffer | Schluesselbund): Schluesselbund =>
  Buffer.isBuffer(key) ? { primaer: key, alte: [] } : key;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'MAIL_ENCRYPTION_KEY is not set. Postfächer lassen sich ohne Schlüssel nicht speichern.',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

export class UndecryptableSecretError extends Error {
  constructor() {
    super(
      'Dieses Postfach lässt sich nicht mehr entschlüsseln. Bitte erneut verbinden.',
    );
    this.name = 'UndecryptableSecretError';
  }
}

export const readKey = (raw: string | undefined): Buffer => {
  if (raw === undefined || raw.trim() === '') {
    throw new MissingEncryptionKeyError();
  }

  const trimmed = raw.trim();
  const decoded = /^[0-9a-fA-F]{64}$/u.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `MAIL_ENCRYPTION_KEY must be ${String(KEY_BYTES)} bytes — 64 hex characters or 44 base64. Generate one with: openssl rand -base64 32`,
    );
  }

  return decoded;
};

export const schluesselbund = (
  raw: string | undefined,
  alteRoh?: string,
): Schluesselbund => ({
  primaer: readKey(raw),
  alte: (alteRoh ?? '')
    .split(',')
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '')
    .map((teil) => readKey(teil)),
});

export const mailSchluessel = (config: {
  get: <T = string>(name: string) => T | undefined;
}): Schluesselbund =>
  schluesselbund(
    config.get<string>('mailEncryptionKey'),
    config.get<string>('mailEncryptionKeyAlt'),
  );

export const seal = (
  plaintext: string,
  key: Buffer | Schluesselbund,
): string => {
  const { primaer } = alsBund(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, primaer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    PREFIX_V2,
    schluesselKennung(primaer),
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
};

export const open = (sealed: string, key: Buffer | Schluesselbund): string => {
  const bund = alsBund(key);
  const parts = sealed.split(':');

  if (parts.length === 5 && parts[0] === PREFIX_V2) {
    const passend = [bund.primaer, ...bund.alte].find(
      (kandidat) => schluesselKennung(kandidat) === parts[1],
    );

    if (passend === undefined) {
      throw new UndecryptableSecretError();
    }

    return entschluesseln(parts.slice(2), passend);
  }

  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new UndecryptableSecretError();
  }

  for (const kandidat of [bund.primaer, ...bund.alte]) {
    try {
      return entschluesseln(parts.slice(1), kandidat);
    } catch {}
  }

  throw new UndecryptableSecretError();
};

export const mitAktuellemSchluessel = (
  sealed: string,
  key: Buffer | Schluesselbund,
): boolean => {
  const parts = sealed.split(':');

  return (
    parts.length === 5 &&
    parts[0] === PREFIX_V2 &&
    parts[1] === schluesselKennung(alsBund(key).primaer)
  );
};

const entschluesseln = (
  [ivTeil, tagTeil, inhalt]: string[],
  key: Buffer,
): string => {
  try {
    const iv = Buffer.from(ivTeil, 'base64');
    const tag = Buffer.from(tagTeil, 'base64');
    const payload = Buffer.from(inhalt, 'base64');

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new UndecryptableSecretError();
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(payload), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new UndecryptableSecretError();
  }
};

export const sameSecret = (left: string, right: string): boolean => {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
};
