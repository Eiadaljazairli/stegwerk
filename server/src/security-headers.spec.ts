import { createHash } from 'node:crypto';

import {
  contentSecurityPolicy,
  inlineScriptHashes,
  originOf,
  securityHeaders,
} from './security-headers';

const direktive = (richtlinie: string, name: string): string[] => {
  const teil = richtlinie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(`${name} `));

  if (teil === undefined) {
    throw new Error(`Direktive ${name} fehlt in: ${richtlinie}`);
  }

  return teil.split(/\s+/u).slice(1);
};

describe('Skripte in der Seite', () => {
  const SKRIPT = "console.log('hallo')";

  const hashVon = (inhalt: string) =>
    `'sha256-${createHash('sha256').update(inhalt, 'utf8').digest('base64')}'`;

  it('bildet den Hash über genau den Inhalt zwischen den Marken', () => {
    expect(inlineScriptHashes(`<script>${SKRIPT}</script>`)).toEqual([
      hashVon(SKRIPT),
    ]);
  });

  it('überspringt Skripte mit src, die gehören zu self', () => {
    expect(
      inlineScriptHashes('<script type="module" src="/assets/x.js"></script>'),
    ).toEqual([]);
  });

  it('nimmt mehrere', () => {
    const html = `<script>${SKRIPT}</script><script src="/a.js"></script><script>var b=2</script>`;

    expect(inlineScriptHashes(html)).toEqual([
      hashVon(SKRIPT),
      hashVon('var b=2'),
    ]);
  });

  it('überspringt JSON-LD, das ist ein Datenblock und kein Skript', () => {
    const html = `<script type="application/ld+json">{"@type":"SoftwareApplication"}</script><script>${SKRIPT}</script>`;

    expect(inlineScriptHashes(html)).toEqual([hashVon(SKRIPT)]);
  });

  it('ignoriert ein leeres Skript', () => {
    expect(inlineScriptHashes('<script>   </script>')).toEqual([]);
  });

  it('findet auch ein Skript mit Attributen vor dem Inhalt', () => {
    expect(inlineScriptHashes(`<script defer>${SKRIPT}</script>`)).toEqual([
      hashVon(SKRIPT),
    ]);
  });

  it('kommt mit der echten index.html zurecht', () => {
    const html = [
      '<!doctype html><html><head>',
      '    <script>',
      '      // ein Kommentar',
      "      document.documentElement.setAttribute('data-theme', 'dark');",
      '    </script>',
      '    <script type="module" crossorigin src="/assets/index-abc.js"></script>',
      '</head><body></body></html>',
    ].join('\n');

    expect(inlineScriptHashes(html)).toHaveLength(1);
  });
});

describe('die Richtlinie', () => {
  it('erlaubt Skripte nur von hier, plus die genannten Hashes', () => {
    const werte = direktive(
      contentSecurityPolicy({ scriptHashes: ["'sha256-abc'"] }),
      'script-src',
    );

    expect(werte).toEqual(["'self'", "'sha256-abc'"]);
  });

  it('erlaubt Skripten niemals unsafe-inline', () => {
    const richtlinie = contentSecurityPolicy({
      scriptHashes: ["'sha256-abc'"],
    });

    expect(direktive(richtlinie, 'script-src')).not.toContain(
      "'unsafe-inline'",
    );
    expect(direktive(richtlinie, 'script-src')).not.toContain("'unsafe-eval'");
  });

  it('erlaubt Stile inline, weil die Oberfläche Maße ausrechnet', () => {
    expect(direktive(contentSecurityPolicy(), 'style-src')).toContain(
      "'unsafe-inline'",
    );
  });

  it('lädt Worker nur von hier, nicht aus blob: oder data:', () => {
    expect(direktive(contentSecurityPolicy(), 'worker-src')).toEqual([
      "'self'",
    ]);
  });

  it('verbietet das Einbetten in fremde Seiten', () => {
    expect(direktive(contentSecurityPolicy(), 'frame-ancestors')).toEqual([
      "'none'",
    ]);
  });

  it('bindet base und Formularziele an den eigenen Ursprung', () => {
    const richtlinie = contentSecurityPolicy();

    expect(direktive(richtlinie, 'base-uri')).toEqual(["'self'"]);
    expect(direktive(richtlinie, 'form-action')).toEqual(["'self'"]);
  });

  it('nimmt zusätzliche Ziele für Verbindungen auf', () => {
    const werte = direktive(
      contentSecurityPolicy({ connectSources: ['https://x.ingest.sentry.io'] }),
      'connect-src',
    );

    expect(werte).toEqual(["'self'", 'https://x.ingest.sentry.io']);
  });

  it('erlaubt ohne Zusätze nur den eigenen Ursprung', () => {
    expect(direktive(contentSecurityPolicy(), 'connect-src')).toEqual([
      "'self'",
    ]);
  });

  it('trennt die Direktiven so, dass der Browser sie einzeln liest', () => {
    const richtlinie = contentSecurityPolicy();

    for (const name of [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-ancestors',
      'object-src',
      'base-uri',
      'form-action',
    ]) {
      expect(() => direktive(richtlinie, name)).not.toThrow();
    }
  });
});

describe('die übrigen Kopfzeilen', () => {
  it('schickt HSTS nur, wenn danach gefragt wird', () => {
    expect(securityHeaders({})['Strict-Transport-Security']).toBeUndefined();
    expect(securityHeaders({ hsts: true })['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('nimmt preload nicht mit auf', () => {
    expect(
      securityHeaders({ hsts: true })['Strict-Transport-Security'],
    ).not.toContain('preload');
  });

  it('setzt die vier, die vorher ganz fehlten', () => {
    const kopf = securityHeaders({});

    expect(kopf['X-Content-Type-Options']).toBe('nosniff');
    expect(kopf['X-Frame-Options']).toBe('DENY');
    expect(kopf['Referrer-Policy']).toBe('same-origin');
    expect(kopf['Permissions-Policy']).toContain('camera=()');
  });

  it('hält den Referrer bei fremden Zielen zurück', () => {
    expect(securityHeaders({})['Referrer-Policy']).toBe('same-origin');
  });
});

describe('der Ursprung einer Meldestelle', () => {
  it('nimmt den Ursprung aus einer Adresse', () => {
    expect(originOf('https://abc@o1.ingest.sentry.io/42')).toBe(
      'https://o1.ingest.sentry.io',
    );
  });

  it('gibt nichts zurück, wenn keine gesetzt ist', () => {
    expect(originOf(undefined)).toBeUndefined();
    expect(originOf('')).toBeUndefined();
    expect(originOf('   ')).toBeUndefined();
  });

  it('gibt nichts zurück statt zu werfen, wenn es keine Adresse ist', () => {
    expect(originOf('kein-url')).toBeUndefined();
  });
});
