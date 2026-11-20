import { describe, expect, it } from 'vitest';

import { abrufHinweise } from './abruf-hinweis';

const postfach = {
  active: true,
  username: 'ich@firma.de',
  lastError: 'Anmeldung fehlgeschlagen.',
  fehlerZeigen: true,
  fehlerArt: 'anmeldung',
};

const kalender = {
  benutzer: 'ich@firma.de',
  kalenderName: 'Arbeit',
  letzterFehler: 'Der Kalenderserver war nicht erreichbar.',
  fehlerZeigen: true,
  fehlerArt: 'voruebergehend',
};

describe('abrufHinweise', () => {
  it('zeigt Postfach und Kalender mit ihrem Link', () => {
    const hinweise = abrufHinweise(postfach, kalender, '/firmen');

    expect(hinweise.map((h) => [h.art, h.link, h.linkText])).toEqual([
      ['postfach', '/postfach', 'Postfach neu verbinden'],
      ['kalender', '/kalender', 'Zum Kalender'],
    ]);
    expect(hinweise[1].text).toContain('versucht es weiter');
  });

  it('schweigt, solange der Server den Fehler noch nicht zeigen will', () => {
    expect(
      abrufHinweise(
        { ...postfach, fehlerZeigen: false },
        { ...kalender, fehlerZeigen: false },
        '/',
      ),
    ).toEqual([]);
  });

  it('schweigt auf der Seite, die den Fehler behebt, und ohne Fehler', () => {
    expect(abrufHinweise(postfach, null, '/postfach')).toEqual([]);
    expect(abrufHinweise(null, kalender, '/kalender')).toEqual([]);
    expect(abrufHinweise({ ...postfach, lastError: null }, null, '/')).toEqual(
      [],
    );
    expect(abrufHinweise({ ...postfach, active: false }, null, '/')).toEqual(
      [],
    );
  });

  it('sagt bei einem Netzaussetzer nicht „neu verbinden“', () => {
    const [hinweis] = abrufHinweise(
      { ...postfach, fehlerArt: 'voruebergehend' },
      null,
      '/',
    );

    expect(hinweis.linkText).toBe('Zum Postfach');
  });
});
