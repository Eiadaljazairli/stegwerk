import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const wurzel = process.cwd();

const inlineSkripte = (html: string): string[] =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
    .filter(
      (treffer) => !/\bsrc\s*=|application\/ld\+json/iu.test(treffer[1] ?? ''),
    )
    .map((treffer) => treffer[2] ?? '')
    .filter((inhalt) => inhalt.trim() !== '');

const inlineHashes = (html: string): string[] =>
  inlineSkripte(html).map(
    (inhalt) =>
      `sha256-${createHash('sha256').update(inhalt, 'utf8').digest('base64')}`,
  );

describe('die Richtlinie hinter nginx', () => {
  const html = readFileSync(join(wurzel, 'index.html'), 'utf8');
  const conf = readFileSync(join(wurzel, 'security-headers.conf'), 'utf8');

  it('nennt für jedes Skript in der Seite den passenden Hash', () => {
    const erwartet = inlineHashes(html);

    expect(erwartet.length).toBeGreaterThan(0);

    for (const hash of erwartet) {
      expect(conf).toContain(hash);
    }
  });

  it('bleibt beim Bauen dasselbe Skript', () => {
    for (const skript of inlineSkripte(html)) {
      expect(skript).not.toMatch(/^[ \t]*\/\/.*$/mu);
      expect(skript).not.toMatch(/\n[ \t]*(?=\n)/u);
    }
  });

  it('erlaubt Skripten auch dort kein unsafe-inline', () => {
    const zeile = conf
      .split('\n')
      .find((z) => z.includes('Content-Security-Policy'));

    expect(zeile).toBeDefined();

    const scriptSrc = (zeile ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('setzt dieselben Kopfzeilen wie der Server', () => {
    for (const name of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ]) {
      expect(conf).toContain(name);
    }
  });
});

describe('die Richtlinie für das einbettbare Formular', () => {
  const html = readFileSync(join(wurzel, 'index.html'), 'utf8');
  const conf = readFileSync(
    join(wurzel, 'security-headers-einbettbar.conf'),
    'utf8',
  );

  it('nennt denselben Skript-Hash wie die übrige Seite', () => {
    for (const hash of inlineHashes(html)) {
      expect(conf).toContain(hash);
    }
  });

  it('erlaubt das Rahmen nur durch https-Seiten und sonst nichts Neues', () => {
    expect(conf).toContain('frame-ancestors https:;');
    expect(conf).not.toContain('add_header X-Frame-Options');
    expect(conf).not.toContain('unsafe-eval');
  });
});
