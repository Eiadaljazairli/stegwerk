import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ankerAusHash } from './Anker';

describe('ankerAusHash', () => {
  it('liest die Sprungmarke und entschlüsselt sie', () => {
    expect(ankerAusHash('#webhooks')).toBe('webhooks');
    expect(ankerAusHash('#zwei%20faktor')).toBe('zwei faktor');
  });

  it('springt ohne Marke nirgends hin', () => {
    expect(ankerAusHash('')).toBeNull();
    expect(ankerAusHash('#')).toBeNull();
  });

  it('wirft bei einem kaputten Hash nicht, sondern springt nicht', () => {
    expect(() => ankerAusHash('#100%')).not.toThrow();
    expect(ankerAusHash('#100%')).toBeNull();
    expect(ankerAusHash('#%E0%A4%A')).toBeNull();
  });
});

const quelldateien = (ordner: string): string[] =>
  readdirSync(ordner, { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      return quelldateien(pfad);
    }
    return /\.tsx?$/u.test(eintrag.name) && !/\.spec\.tsx?$/u.test(eintrag.name)
      ? [pfad]
      : [];
  });

describe('Hash in den Seiten', () => {
  it('wird nur über ankerAusHash entschlüsselt, damit #100% keine Seite abstürzen lässt', () => {
    const src = join(__dirname, '..');
    const direkt = quelldateien(src).filter(
      (pfad) =>
        pfad !== join(__dirname, 'Anker.tsx') &&
        /decodeURIComponent\(\s*(location\.)?hash/u.test(
          readFileSync(pfad, 'utf8'),
        ),
    );

    expect(direkt.map((pfad) => relative(src, pfad))).toEqual([]);
  });
});
