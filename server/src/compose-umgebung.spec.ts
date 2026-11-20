import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const quelle = join(__dirname);
const compose = readFileSync(
  join(__dirname, '..', '..', 'docker-compose.prod.yml'),
  'utf8',
);

const dateien = (ordner: string): string[] =>
  readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);

    return statSync(pfad).isDirectory()
      ? dateien(pfad)
      : name.endsWith('.ts') && !name.endsWith('.spec.ts')
        ? [pfad]
        : [];
  });

const gelesen = [
  ...new Set(
    dateien(quelle).flatMap((datei) =>
      [...readFileSync(datei, 'utf8').matchAll(/\bLEGAL_[A-Z_]+\b/gu)].map(
        (treffer) => treffer[0],
      ),
    ),
  ),
].sort();

describe('docker-compose.prod.yml', () => {
  it('reicht jede LEGAL_-Angabe an die API weiter', () => {
    const fehlt = gelesen.filter(
      (name) => !new RegExp(`^\\s+${name}:`, 'mu').test(compose),
    );

    expect(fehlt).toEqual([]);
  });

  it('findet die Angaben überhaupt', () => {
    expect(gelesen).toContain('LEGAL_HOSTING');
  });
});
