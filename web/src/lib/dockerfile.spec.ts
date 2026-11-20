import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const web = process.cwd();
const repo = resolve(web, '..');

const dateien = (ordner: string): string[] =>
  readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);

    return statSync(pfad).isDirectory()
      ? dateien(pfad)
      : /\.(ts|tsx)$/u.test(name)
        ? [pfad]
        : [];
  });

const ausserhalb = (): string[] => {
  const ziele = new Set<string>();

  for (const datei of dateien(join(web, 'src'))) {
    const text = readFileSync(datei, 'utf8');

    for (const treffer of text.matchAll(/from '(\.\.\/[^'?]+)/gu)) {
      const ziel = relative(repo, resolve(join(datei, '..'), treffer[1]));

      if (!ziel.startsWith('web/') && !ziel.startsWith('..')) {
        ziele.add(ziel);
      }
    }
  }

  return [...ziele].sort();
};

const kopiert = (dockerfile: string): string[] =>
  readFileSync(join(repo, dockerfile), 'utf8')
    .split('\n')
    .filter((zeile) => /^COPY (?!--from)/u.test(zeile))
    .flatMap((zeile) => zeile.split(/\s+/u).slice(1, -1));

describe.each(['web/Dockerfile', 'Dockerfile'])('%s', (dockerfile) => {
  it('kopiert alles, was das Web von außerhalb einbindet', () => {
    const quellen = kopiert(dockerfile);
    const fehlt = ausserhalb().filter(
      (ziel) =>
        !quellen.some(
          (quelle) => ziel === quelle || ziel.startsWith(`${quelle}/`),
        ),
    );

    expect(fehlt).toEqual([]);
  });
});

describe('Importe von außerhalb', () => {
  it('findet die Importe überhaupt', () => {
    expect(ausserhalb()).toContain('scripts/schema-referenz.mjs');
  });
});
