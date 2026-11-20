import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { VORGERENDERTE_BEREICHE } from './web-fallback';

const dateien = (ordner: string): string[] =>
  readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);

    return statSync(pfad).isDirectory()
      ? dateien(pfad)
      : name.endsWith('.controller.ts')
        ? [pfad]
        : [];
  });

it('reicht jeden Controller-Pfad an den Server weiter', () => {
  const nginx = readFileSync(join(__dirname, '../../web/nginx.conf'), 'utf8');
  const gruppe = /location ~ \^\/\(([^)]+)\)\(\/\|\$\)/u.exec(nginx)?.[1];

  expect(gruppe).toBeDefined();

  const weitergereicht = new Set((gruppe ?? '').split('|'));
  const eigeneBloecke = new Set(['billing', 'live']);

  const fehlend = dateien(__dirname)
    .flatMap((datei) =>
      [
        ...readFileSync(datei, 'utf8').matchAll(/@Controller\('([^']+)'\)/gu),
      ].map((treffer) => treffer[1].split('/')[0]),
    )
    .filter(
      (anfang) => !weitergereicht.has(anfang) && !eigeneBloecke.has(anfang),
    );

  expect([...new Set(fehlend)]).toEqual([]);
});

it('liefert dieselben vorgerenderten Seiten aus wie der Server', () => {
  const nginx = readFileSync(join(__dirname, '../../web/nginx.conf'), 'utf8');
  const gruppe =
    /location ~ \^\/\(([^)]+)\)\(\/\|\$\) \{\n[^}]*try_files \$uri\/index\.html \/index\.html;/u.exec(
      nginx,
    )?.[1];

  expect(gruppe).toBeDefined();
  expect((gruppe ?? '').split('|').sort()).toEqual(
    [...VORGERENDERTE_BEREICHE].sort(),
  );
  expect(nginx).toMatch(
    /location = \/ \{[^}]*try_files \/start\.html \/index\.html;/u,
  );
});

it('reicht den Ereignisstrom ungepuffert und ohne kurze Frist durch', () => {
  const nginx = readFileSync(join(__dirname, '../../web/nginx.conf'), 'utf8');
  const block = /location \/live \{([^}]*)\}/u.exec(nginx)?.[1] ?? '';

  expect(block).toMatch(/proxy_pass http:\/\/api:4000\/live;/u);
  expect(block).toMatch(/proxy_buffering off;/u);
  expect(block).toMatch(/proxy_read_timeout (\d+)s;/u);
  expect(
    Number(/proxy_read_timeout (\d+)s;/u.exec(block)?.[1]),
  ).toBeGreaterThan(60);
});
