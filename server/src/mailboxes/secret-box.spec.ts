import { createCipheriv, randomBytes } from 'node:crypto';

import {
  MissingEncryptionKeyError,
  mitAktuellemSchluessel,
  open,
  readKey,
  sameSecret,
  schluesselbund,
  schluesselKennung,
  seal,
  UndecryptableSecretError,
} from './secret-box';

const key = randomBytes(32);
const other = randomBytes(32);

describe('reading the key', () => {
  it('accepts 64 hex characters, which is what openssl rand -hex 32 gives', () => {
    expect(readKey('a'.repeat(64))).toHaveLength(32);
  });

  it('accepts base64, which is what openssl rand -base64 32 gives', () => {
    expect(readKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('ignores whitespace around a pasted key', () => {
    expect(readKey(`  ${'b'.repeat(64)}\n`)).toHaveLength(32);
  });

  it('refuses to run without one', () => {
    expect(() => readKey(undefined)).toThrow(MissingEncryptionKeyError);
    expect(() => readKey('')).toThrow(MissingEncryptionKeyError);
    expect(() => readKey('   ')).toThrow(MissingEncryptionKeyError);
  });

  it('refuses a key of the wrong length rather than padding it', () => {
    expect(() => readKey('abc')).toThrow(/32 bytes/u);
    expect(() => readKey('a'.repeat(32))).toThrow(/32 bytes/u);
  });

  it('says how to make one', () => {
    expect(() => readKey('kurz')).toThrow(/openssl rand/u);
  });
});

describe('sealing and opening', () => {
  it('gives the secret back', () => {
    expect(open(seal('geheim123', key), key)).toBe('geheim123');
  });

  it('handles a password with umlauts and symbols', () => {
    const password = 'Süß!ẞ€#/\\"\'`~ 🔐';

    expect(open(seal(password, key), key)).toBe(password);
  });

  it('handles an empty string', () => {
    expect(open(seal('', key), key)).toBe('');
  });

  it('does not put the secret in the stored value', () => {
    const sealed = seal('geheim123', key);

    expect(sealed).not.toContain('geheim123');
    expect(Buffer.from(sealed).toString('utf8')).not.toContain('geheim123');
  });

  it('produces a different ciphertext each time', () => {
    expect(seal('gleich', key)).not.toBe(seal('gleich', key));
  });

  it('marks the format and the key, so a reader can tell what a column holds', () => {
    expect(seal('x', key).startsWith(`v2:${schluesselKennung(key)}:`)).toBe(
      true,
    );
  });
});

describe('when it cannot be opened', () => {
  it('refuses the wrong key', () => {
    expect(() => open(seal('geheim', key), other)).toThrow(
      UndecryptableSecretError,
    );
  });

  it('refuses a tampered ciphertext', () => {
    const sealed = seal('geheim123', key);
    const parts = sealed.split(':');
    const payload = Buffer.from(parts[4], 'base64');

    payload[0] ^= 0xff;
    parts[4] = payload.toString('base64');

    expect(() => open(parts.join(':'), key)).toThrow(UndecryptableSecretError);
  });

  it('refuses a tampered tag', () => {
    const parts = seal('geheim123', key).split(':');
    const tag = Buffer.from(parts[3], 'base64');

    tag[0] ^= 0xff;
    parts[3] = tag.toString('base64');

    expect(() => open(parts.join(':'), key)).toThrow(UndecryptableSecretError);
  });

  it('refuses a swapped IV', () => {
    const first = seal('geheim123', key).split(':');
    const second = seal('anderes', key).split(':');

    first[2] = second[2];

    expect(() => open(first.join(':'), key)).toThrow(UndecryptableSecretError);
  });

  it('refuses something that was never sealed', () => {
    expect(() => open('geheim123', key)).toThrow(UndecryptableSecretError);
    expect(() => open('', key)).toThrow(UndecryptableSecretError);
    expect(() => open('v1:only:three', key)).toThrow(UndecryptableSecretError);
  });

  it('refuses an unknown format version', () => {
    const parts = seal('geheim', key).split(':');

    parts[0] = 'v9';

    expect(() => open(parts.join(':'), key)).toThrow(UndecryptableSecretError);
  });

  it('refuses an IV of the wrong length', () => {
    const parts = seal('geheim', key).split(':');

    parts[2] = randomBytes(8).toString('base64');

    expect(() => open(parts.join(':'), key)).toThrow(UndecryptableSecretError);
  });

  it('says the same thing however it failed', () => {
    const messages = new Set<string>();

    for (const attempt of ['nonsense', 'v1:a:b:c', seal('x', other)]) {
      try {
        open(attempt, key);
      } catch (error) {
        messages.add((error as Error).message);
      }
    }

    expect(messages.size).toBe(1);
  });
});

describe('comparing two secrets', () => {
  it('recognises the same one', () => {
    expect(sameSecret('geheim', 'geheim')).toBe(true);
  });

  it('recognises a different one', () => {
    expect(sameSecret('geheim', 'anders')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    expect(sameSecret('kurz', 'viel laenger')).toBe(false);
    expect(sameSecret('', 'x')).toBe(false);
  });

  it('treats two empty strings as equal', () => {
    expect(sameSecret('', '')).toBe(true);
  });
});

const versiegeltV1 = (plaintext: string, mit: Buffer): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mit, iv);
  const inhalt = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    inhalt.toString('base64'),
  ].join(':');
};

describe('Schlüsselrotation', () => {
  const bund = { primaer: other, alte: [key] };

  it('liest Werte von vor der Kennung weiter', () => {
    expect(open(versiegeltV1('alt', key), key)).toBe('alt');
    expect(open(versiegeltV1('alt', key), bund)).toBe('alt');
  });

  it('liest mit dem alten Schlüssel, versiegelt mit dem neuen', () => {
    const vorher = seal('geheim', key);

    expect(open(vorher, bund)).toBe('geheim');
    expect(mitAktuellemSchluessel(vorher, bund)).toBe(false);

    const nachher = seal(open(vorher, bund), bund);

    expect(nachher.split(':')[1]).toBe(schluesselKennung(other));
    expect(mitAktuellemSchluessel(nachher, bund)).toBe(true);
    expect(open(nachher, other)).toBe('geheim');
  });

  it('lehnt ab, wenn der Schlüssel der Kennung fehlt', () => {
    expect(() => open(seal('geheim', key), other)).toThrow(
      UndecryptableSecretError,
    );
  });

  it('liest alte Schlüssel durch Komma getrennt', () => {
    const roh = (k: Buffer) => k.toString('base64');
    const gelesen = schluesselbund(roh(other), ` ${roh(key)} , `);

    expect(gelesen.primaer.equals(other)).toBe(true);
    expect(gelesen.alte).toHaveLength(1);
    expect(gelesen.alte[0].equals(key)).toBe(true);
    expect(schluesselbund(roh(other)).alte).toEqual([]);
  });

  it('nimmt einen falschen alten Schlüssel nicht still hin', () => {
    expect(() => schluesselbund(other.toString('base64'), 'zu-kurz')).toThrow();
  });
});
