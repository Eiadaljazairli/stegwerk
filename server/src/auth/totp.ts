import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCHRITT_SEKUNDEN = 30;

const STELLEN = 6;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (bytes: Buffer): string => {
  let bits = 0;
  let wert = 0;
  let ausgabe = '';

  for (const byte of bytes) {
    wert = (wert << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      ausgabe += BASE32_ALPHABET[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    ausgabe += BASE32_ALPHABET[(wert << (5 - bits)) & 31];
  }

  return ausgabe;
};

export const base32Decode = (text: string): Buffer => {
  const sauber = text.toUpperCase().replace(/[=\s-]/gu, '');
  const bytes: number[] = [];
  let bits = 0;
  let wert = 0;

  for (const zeichen of sauber) {
    const index = BASE32_ALPHABET.indexOf(zeichen);

    if (index === -1) {
      throw new Error(`Kein gültiges Base32-Zeichen: ${zeichen}`);
    }

    wert = (wert << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((wert >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

export const neuesGeheimnis = (): string => base32Encode(randomBytes(20));

export const codeFuer = (geheimnisBase32: string, zaehler: number): string => {
  const schluessel = base32Decode(geheimnisBase32);
  const puffer = Buffer.alloc(8);

  puffer.writeUInt32BE(Math.floor(zaehler / 2 ** 32), 0);
  puffer.writeUInt32BE(zaehler >>> 0, 4);

  const hmac = createHmac('sha1', schluessel).update(puffer).digest();

  const versatz = hmac[hmac.length - 1] & 0x0f;
  const zahl =
    ((hmac[versatz] & 0x7f) << 24) |
    ((hmac[versatz + 1] & 0xff) << 16) |
    ((hmac[versatz + 2] & 0xff) << 8) |
    (hmac[versatz + 3] & 0xff);

  return String(zahl % 10 ** STELLEN).padStart(STELLEN, '0');
};

export const zaehlerFuer = (zeitpunktMs: number): number =>
  Math.floor(zeitpunktMs / 1000 / SCHRITT_SEKUNDEN);

export const pruefeCode = (
  geheimnisBase32: string,
  eingabe: string,
  jetztMs: number,
  fenster = 1,
): number | null => {
  const getippt = eingabe.replace(/\s/gu, '');

  if (!/^\d{6}$/u.test(getippt)) {
    return null;
  }

  const jetzt = zaehlerFuer(jetztMs);

  for (let versatz = -fenster; versatz <= fenster; versatz += 1) {
    const zaehler = jetzt + versatz;
    const erwartet = Buffer.from(codeFuer(geheimnisBase32, zaehler));
    const geliefert = Buffer.from(getippt);

    if (
      erwartet.length === geliefert.length &&
      timingSafeEqual(erwartet, geliefert)
    ) {
      return zaehler;
    }
  }

  return null;
};

export const otpauthUrl = (input: {
  geheimnis: string;
  konto: string;
  herausgeber: string;
}): string => {
  const label = encodeURIComponent(`${input.herausgeber}:${input.konto}`);
  const parameter = new URLSearchParams({
    secret: input.geheimnis,
    issuer: input.herausgeber,
    algorithm: 'SHA1',
    digits: String(STELLEN),
    period: String(SCHRITT_SEKUNDEN),
  });

  return `otpauth://totp/${label}?${parameter.toString()}`;
};
