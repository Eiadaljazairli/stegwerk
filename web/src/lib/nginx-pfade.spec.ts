import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const konfiguration = readFileSync(join(process.cwd(), 'nginx.conf'), 'utf8');

const block = (muster: string): string => {
  const kopf = `location ${muster} {`;
  const anfang = konfiguration.indexOf(kopf);

  expect(anfang).toBeGreaterThanOrEqual(0);

  return konfiguration.slice(
    anfang + kopf.length,
    konfiguration.indexOf('}', anfang),
  );
};

describe('web/nginx.conf', () => {
  it('liefert in location / kein Verzeichnis aus', () => {
    const tryFiles = /try_files\s+([^;]+);/u.exec(block('/'));

    expect(tryFiles).not.toBeNull();
    expect(tryFiles?.[1].split(/\s+/u)).not.toContain('$uri/');
    expect(tryFiles?.[1]).toMatch(/\/index\.html$/u);
  });

  it('rendert einen Unterpfad von /hilfe vor', () => {
    expect(konfiguration).toMatch(/hilfe\/fehlerbehebung/u);
  });
});
