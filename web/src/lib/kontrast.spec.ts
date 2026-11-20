import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kontrast, leuchtdichte, type Token, tokenAus } from './kontrast';

const SRC = join(__dirname, '..');
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

const hell = tokenAus(css, ':root');
const dunkel = tokenAus(css, ":root[data-theme='dark']");
const dunkelSystem = tokenAus(css, ":root:not([data-theme='light'])");

const AA = 4.5;

const NACH = (() => {
  const chip = css.indexOf('--chip-grau-bg');
  const ende = css.lastIndexOf('}', chip);

  return css.slice(Math.max(0, ende - 160), ende + 1);
})();

const paar = (t: Token, schrift: string, grund: string): number => {
  const a = t[schrift];
  const b = t[grund];

  if (a === undefined || b === undefined) {
    throw new Error(`Token fehlt: ${a === undefined ? schrift : grund}`);
  }

  return kontrast(a, b);
};

describe('kontrast', () => {
  it('rechnet wie WCAG', () => {
    expect(kontrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(kontrast('#fff', '#fff')).toBe(1);
    expect(kontrast('#3e63dd', '#ffffff')).toBeCloseTo(5.21, 2);
    expect(kontrast('#999999', '#ffffff')).toBeLessThan(AA);
  });

  it('ist symmetrisch', () => {
    expect(kontrast('#333333', '#f1f1f1')).toBe(kontrast('#f1f1f1', '#333333'));
  });

  it('lehnt alles ab, was keine Hex-Farbe ist', () => {
    expect(() => leuchtdichte('rot')).toThrow(/Keine Hex-Farbe/u);
    expect(() => leuchtdichte('#12345')).toThrow(/Keine Hex-Farbe/u);
  });
});

describe('tokenAus', () => {
  it('liest die Token eines Blocks', () => {
    expect(tokenAus(':root { --a: #FFF; --b: 3px; }', ':root')).toEqual({
      a: '#fff',
    });
  });

  it('meldet einen fehlenden Block', () => {
    expect(() => tokenAus('', ':root')).toThrow(/Block fehlt/u);
    expect(() => tokenAus(':root {}', ':root', 'gibt es nicht')).toThrow(
      /Stelle fehlt/u,
    );
  });
});

describe('die Farbtoken', () => {
  it('sind im dunklen Thema gleich, ob vom System oder gewählt', () => {
    expect(dunkelSystem).toEqual(dunkel);
  });

  it('geben Karten keinen Schatten, nur schwebenden Flächen', () => {
    expect(css).toMatch(/:root \{[^}]*--shadow-sm: none;/u);
    expect(css).toMatch(
      /:root\[data-theme='dark'\] \{[^}]*--shadow-sm: none;/u,
    );
  });

  it('sind neutrale Graustufen, ein gedämpftes Blau und Tinte', () => {
    expect(hell.text).toBe('#333333');
    expect(hell['text-muted']).toBe('#666666');
    expect(hell.border).toBe('#ebebeb');
    expect(hell.accent).toBe('#3451b2');
    expect(hell.primary).toBe('#333333');
    expect(dunkel.primary).toBe('#ebebeb');
    expect(dunkel.surface).toBe('#171717');
    expect(dunkel.text).toBe('#ebebeb');
  });

  const GRUENDE = ['surface', 'sunken', 'raised', 'overlay'];
  const SCHRIFTEN = ['text', 'text-muted', 'text-faint', 'accent'];

  for (const [name, t] of [
    ['hell', hell],
    ['dunkel', dunkel],
  ] as const) {
    describe(name, () => {
      for (const schrift of SCHRIFTEN) {
        for (const grund of GRUENDE) {
          it(`--${schrift} auf --${grund} hält AA`, () => {
            expect(paar(t, schrift, grund)).toBeGreaterThanOrEqual(AA);
          });
        }
      }

      it.each([
        ['text-faint', 'accent-soft'],
        ['accent', 'accent-soft'],
        ['on-accent', 'accent'],
        ['on-primary', 'primary'],
        ['on-primary', 'primary-hover'],
        ['disabled-text', 'disabled-bg'],
        ['on-negative', 'negative'],
        ['positive', 'surface'],
        ['positive', 'positive-soft'],
        ['negative', 'surface'],
        ['negative', 'negative-soft'],
        ['warning', 'surface'],
        ['warning', 'warning-soft'],
        ['chrome-text', 'chrome'],
        ['chrome-muted', 'chrome'],
        ['chrome-text', 'chrome-raised'],
        ['chrome-muted', 'chrome-raised'],
      ])('--%s auf --%s hält AA', (schrift, grund) => {
        expect(paar(t, schrift, grund)).toBeGreaterThanOrEqual(AA);
      });
    });
  }

  describe('die farbigen Auswahl-Chips', () => {
    const chipsHell = tokenAus(css, ':root', NACH);
    const chipsDunkel = tokenAus(css, ":root[data-theme='dark']", NACH);
    const FARBEN = [
      'grau',
      'rot',
      'orange',
      'gelb',
      'gruen',
      'blau',
      'lila',
      'pink',
    ];

    it('sind im dunklen Thema gleich, ob vom System oder gewählt', () => {
      expect(tokenAus(css, ":root:not([data-theme='light'])", NACH)).toEqual(
        chipsDunkel,
      );
    });

    for (const farbe of FARBEN) {
      it(`${farbe} hält AA in beiden Themen`, () => {
        expect(
          paar(chipsHell, `chip-${farbe}-fg`, `chip-${farbe}-bg`),
        ).toBeGreaterThanOrEqual(AA);
        expect(
          paar(chipsDunkel, `chip-${farbe}-fg`, `chip-${farbe}-bg`),
        ).toBeGreaterThanOrEqual(AA);
      });
    }
  });
});

describe('die Sterne der Bewertung', () => {
  const sterneHell = { ...hell, ...tokenAus(css, ':root', NACH) };
  const sterneDunkel = {
    ...dunkel,
    ...tokenAus(css, ":root[data-theme='dark']", NACH),
  };

  it('sind im dunklen Thema gleich, ob vom System oder gewählt', () => {
    const system = tokenAus(css, ":root:not([data-theme='light'])", NACH);

    expect(system['stern-an']).toBe(sterneDunkel['stern-an']);
    expect(system['stern-aus']).toBe(sterneDunkel['stern-aus']);
  });

  it('leer nehmen sie --stern-aus, nicht --border', () => {
    expect(css).toMatch(/\.sterne__aus \{\s*color: var\(--stern-aus\);/u);
  });

  for (const [name, t] of [
    ['hell', sterneHell],
    ['dunkel', sterneDunkel],
  ] as const) {
    for (const stern of ['stern-an', 'stern-aus']) {
      for (const grund of ['surface', 'sunken', 'raised', 'overlay']) {
        it(`${name}: --${stern} auf --${grund} hält 3:1`, () => {
          expect(paar(t, stern, grund)).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
});

describe('die Schrift', () => {
  const quellen = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gu)].map(
    (m) => m[1],
  );

  it('ist Inter und liegt im Repository', () => {
    expect(css).toMatch(/font-family: 'Inter Variable';/u);

    const schriften = quellen.filter((q) => q.endsWith('.woff2'));

    expect(schriften.length).toBeGreaterThanOrEqual(2);

    for (const datei of schriften) {
      expect(datei.startsWith('./fonts/')).toBe(true);
      expect(existsSync(join(SRC, datei))).toBe(true);
    }

    expect(existsSync(join(SRC, 'fonts', 'LICENSE-Inter.txt'))).toBe(true);
  });

  it('kommt von keinem fremden Server', () => {
    for (const quelle of quellen) {
      expect(quelle).not.toMatch(/^(https?:)?\/\//u);
    }

    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import/u);
  });
});

describe('die Symbole', () => {
  const VERBOTEN = ['✕', '☆', '★', '🔒', '📎', '🔗', '☐', '✓'];
  const ALLEIN = new Set(['×', '‹', '›', '↑', '↓', '←', '→']);
  const PFEIL = [
    /['"`][←→↑↓]['"`]/u,
    />[←→↑↓]</u,
    /(^|>)[←→↑↓]\s/u,
    /\s[←→↑↓]</u,
    /\}\s*[←→↑↓]$/u,
  ];

  const dateien = (ordner: string): string[] =>
    readdirSync(join(SRC, ordner))
      .filter((d) => d.endsWith('.tsx') && !d.includes('.spec.'))
      .map((d) => join(ordner, d));

  const funde = [...dateien('components'), ...dateien('pages')].flatMap(
    (datei) =>
      readFileSync(join(SRC, datei), 'utf8')
        .split('\n')
        .map((zeile, i) => ({ datei, nr: i + 1, zeile: zeile.trim() }))
        .filter(
          ({ zeile }) =>
            !zeile.startsWith('//') &&
            !zeile.startsWith('*') &&
            !zeile.startsWith('/*') &&
            (VERBOTEN.some((z) => zeile.includes(z)) ||
              ALLEIN.has(zeile) ||
              /^[×✕←→]\s*\{/u.test(zeile) ||
              PFEIL.some((r) => r.test(zeile))),
        )
        .map(({ datei, nr, zeile }) => `${datei}:${String(nr)}: ${zeile}`),
  );

  it('stehen nicht als Zeichen in Knöpfen', () => {
    expect(funde).toEqual([]);
  });

  it('erkennen Pfeile in Knöpfen und Links, nicht im Satz', () => {
    const trifft = (zeile: string): boolean =>
      PFEIL.some((r) => r.test(zeile.trim()));

    expect(trifft("{aktiv ? '↑' : '↓'}")).toBe(true);
    expect(trifft('            ← Angebote')).toBe(true);
    expect(trifft('<Link to="/verteiler">← Alle Verteiler</Link>')).toBe(true);
    expect(trifft('{link.label} →')).toBe(true);
    expect(trifft('<span aria-hidden="true">→</span>')).toBe(true);
    expect(trifft("'Unter Einstellungen → Sicherheit.'")).toBe(false);
    expect(trifft('<strong>iPhone:</strong> Einstellungen → Accounts →')).toBe(
      false,
    );
  });
});
