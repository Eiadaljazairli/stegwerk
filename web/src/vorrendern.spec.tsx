import { describe, expect, it } from 'vitest';

import { rendere, SEITEN } from './vorrendern';

describe('Vorrendern', () => {
  it('läuft ohne Browser', () => {
    expect(typeof window).toBe('undefined');
  });

  it.each(SEITEN.map((seite) => [seite.pfad]))(
    '%s hat eine Überschrift und den Sprung zum Inhalt',
    (pfad) => {
      const html = rendere(pfad);

      expect(html).toMatch(/<h1[^>]*>[^<]+/u);
      expect(html).not.toContain('Wird geladen');

      if (pfad === '/' || pfad.startsWith('/funktionen')) {
        expect(html).toContain('href="#inhalt"');
        expect(html).toContain('id="inhalt"');
      }
    },
  );

  it('zeigt Besuchern keine Links in die App, die nur angemeldet gehen', () => {
    const html = rendere('/hilfe/fehlerbehebung');

    expect(html).not.toContain('href="/postfach"');
    expect(html).toContain('href="/passwort-vergessen"');
    expect(html).toContain('id="postfach-anmeldung"');
  });

  it('enthält die Referenz der Schnittstelle als Text', () => {
    const html = rendere('/entwickler/referenz');

    expect(html).toContain('createContact');
    expect(html).not.toContain('createApiKey');
  });

  it('nennt auf den Funktionsseiten keine Preise', () => {
    for (const seite of SEITEN.filter((s) =>
      s.pfad.startsWith('/funktionen'),
    )) {
      expect(rendere(seite.pfad)).not.toMatch(/€|kostenlos/iu);
    }
  });
});
