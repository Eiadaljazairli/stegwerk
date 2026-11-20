import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  alsText,
  type DokuBlock,
  type DokuStueck,
  sprungmarke,
  zerlegeDoku,
  zerlegeZeile,
} from './doku-markdown';
import { dokuLinkZiel, ENTWICKLER_TEILE, entwicklerTeil } from './entwickler';

const DOCS = join(process.cwd(), '../docs');

describe('zerlegeZeile', () => {
  it('erkennt Code, fett, kursiv und Links', () => {
    expect(
      zerlegeZeile(
        'Mit `swk_` und **Team → Schlüssel**, *kursiv*, [mcp](mcp.md).',
      ),
    ).toEqual([
      { art: 'text', text: 'Mit ' },
      { art: 'code', text: 'swk_' },
      { art: 'text', text: ' und ' },
      { art: 'fett', kinder: [{ art: 'text', text: 'Team → Schlüssel' }] },
      { art: 'text', text: ', ' },
      { art: 'kursiv', kinder: [{ art: 'text', text: 'kursiv' }] },
      { art: 'text', text: ', ' },
      { art: 'link', ziel: 'mcp.md', kinder: [{ art: 'text', text: 'mcp' }] },
      { art: 'text', text: '.' },
    ]);
  });

  it('lässt Unterstriche in Namen stehen', () => {
    expect(zerlegeZeile('MAIL_ENCRYPTION_KEY bleibt')).toEqual([
      { art: 'text', text: 'MAIL_ENCRYPTION_KEY bleibt' },
    ]);
  });

  it('bleibt bei HTML Text', () => {
    expect(alsText(zerlegeZeile('<script>alert(1)</script>'))).toBe(
      '<script>alert(1)</script>',
    );
  });
});

describe('zerlegeDoku', () => {
  const quelle = [
    '# Titel',
    '',
    'Ein Absatz',
    'über zwei Zeilen.',
    '',
    '## Was ein Schlüssel nicht kann',
    '',
    '- eins',
    '- zwei mit',
    '  Fortsetzung',
    '',
    '1. erstens',
    '2. zweitens',
    '',
    '| Spalte | tut |',
    '| --- | --- |',
    '| `a` | b |',
    '',
    '```bash',
    'curl -fsS https://x \\',
    '  -H "A: b"',
    '```',
    '',
    '## Was ein Schlüssel nicht kann',
  ].join('\n');

  const bloecke = zerlegeDoku(quelle);
  const arten = bloecke.map((block) => block.art);

  it('zerlegt in die richtigen Blöcke', () => {
    expect(arten).toEqual([
      'ueberschrift',
      'absatz',
      'ueberschrift',
      'liste',
      'liste',
      'tabelle',
      'code',
      'ueberschrift',
    ]);
  });

  it('fügt Absätze und Fortsetzungen zusammen', () => {
    const absatz = bloecke[1] as Extract<DokuBlock, { art: 'absatz' }>;
    const liste = bloecke[3] as Extract<DokuBlock, { art: 'liste' }>;

    expect(alsText(absatz.inhalt)).toBe('Ein Absatz über zwei Zeilen.');
    expect(liste.geordnet).toBe(false);
    expect(liste.punkte.map(alsText)).toEqual(['eins', 'zwei mit Fortsetzung']);
    expect((bloecke[4] as Extract<DokuBlock, { art: 'liste' }>).geordnet).toBe(
      true,
    );
  });

  it('liest Tabellen und Codeblöcke wörtlich', () => {
    const tabelle = bloecke[5] as Extract<DokuBlock, { art: 'tabelle' }>;
    const code = bloecke[6] as Extract<DokuBlock, { art: 'code' }>;

    expect(tabelle.kopf.map(alsText)).toEqual(['Spalte', 'tut']);
    expect(tabelle.zeilen[0]?.[0]).toEqual([{ art: 'code', text: 'a' }]);
    expect(code.sprache).toBe('bash');
    expect(code.text).toBe('curl -fsS https://x \\\n  -H "A: b"');
  });

  it('vergibt eindeutige Sprungmarken mit Umlauten', () => {
    const ids = bloecke
      .filter((block) => block.art === 'ueberschrift')
      .map(
        (block) => (block as Extract<DokuBlock, { art: 'ueberschrift' }>).id,
      );

    expect(ids).toEqual([
      'titel',
      'was-ein-schluessel-nicht-kann',
      'was-ein-schluessel-nicht-kann-2',
    ]);
    expect(sprungmarke('Signatur prüfen')).toBe('signatur-pruefen');
  });
});

const links = (stuecke: DokuStueck[]): string[] =>
  stuecke.flatMap((stueck) =>
    stueck.art === 'link'
      ? [stueck.ziel, ...links(stueck.kinder)]
      : stueck.art === 'fett' || stueck.art === 'kursiv'
        ? links(stueck.kinder)
        : [],
  );

const alleStuecke = (block: DokuBlock): DokuStueck[][] => {
  switch (block.art) {
    case 'absatz':
    case 'ueberschrift':
      return [block.inhalt];
    case 'liste':
      return block.punkte;
    case 'tabelle':
      return [...block.kopf, ...block.zeilen.flat()];
    case 'code':
      return [];
  }
};

describe('die Dateien in docs/, die öffentlich stehen', () => {
  const teile = ENTWICKLER_TEILE.filter((teil) => teil.datei !== undefined);

  it.each(teile.map((teil) => [teil.datei ?? '']))(
    '%s zerfällt ohne Rest in Blöcke und hat nur Links, die draußen gelten',
    (datei) => {
      const bloecke = zerlegeDoku(readFileSync(join(DOCS, datei), 'utf8'));

      expect(bloecke[0]?.art).toBe('ueberschrift');
      expect(bloecke.length).toBeGreaterThan(5);

      for (const ziel of bloecke.flatMap(alleStuecke).flatMap(links)) {
        expect([ziel, dokuLinkZiel(ziel)]).not.toEqual([ziel, null]);
      }
    },
  );

  it('verweist auf andere Seiten statt auf Dateien', () => {
    expect(dokuLinkZiel('schnittstelle.md')).toBe('/entwickler/schnittstelle');
    expect(dokuLinkZiel('mcp.md#grenzen')).toBe('/entwickler/mcp#grenzen');
    expect(dokuLinkZiel('#oben')).toBe('#oben');
    expect(dokuLinkZiel('https://example.com')).toBe('https://example.com');
    expect(dokuLinkZiel('oauth.md')).toBeNull();
    expect(dokuLinkZiel('javascript:alert(1)')).toBeNull();
  });

  it('kennt Übersicht und Teile, sonst nichts', () => {
    expect(entwicklerTeil(undefined)?.slug).toBe('');
    expect(entwicklerTeil('referenz')?.titel).toBe(
      'Referenz der Schnittstelle',
    );
    expect(entwicklerTeil('gibtesnicht')).toBeNull();
  });

  it('nennt öffentlich keine anderen Anbieter', () => {
    for (const teil of teile) {
      expect(readFileSync(join(DOCS, teil.datei ?? ''), 'utf8')).not.toMatch(
        /Twenty|HubSpot|Pipedrive|Salesforce/u,
      );
    }
  });

  it('veröffentlicht nichts, das nur den Betrieb angeht', () => {
    expect(teile.map((teil) => teil.datei)).not.toContain('oauth.md');
  });
});
