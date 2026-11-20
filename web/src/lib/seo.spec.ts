import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FEHLERBEHEBUNG_PFAD,
  OEFFENTLICHE_SEITEN,
  vorgerenderteDatei,
} from './oeffentliche-seiten';
import { PRODUKTSEITEN } from './produktseiten';
import {
  GESPERRTE_PFADE,
  herkunftAus,
  robotsTxt,
  sitemapXml,
  vorgerenderteSeite,
} from './seo';

const WEB = process.cwd();

describe('robots.txt', () => {
  it('sperrt die Pfade mit geheimem Teil und nennt die Sitemap', () => {
    const text = robotsTxt('https://stegwerk.example');

    for (const pfad of [
      '/angebot/',
      '/einladung/',
      '/passwort-neu/',
      '/abmelden/',
      '/formular/',
      '/appointments/feed/',
    ]) {
      expect(text).toContain(`Disallow: ${pfad}`);
    }

    expect(text).toContain('Sitemap: https://stegwerk.example/sitemap.xml');
    expect(text.startsWith('User-agent: *\nAllow: /\n')).toBe(true);
  });

  it('sperrt jeden Server-Pfad, der ohne Anmeldung über ein Token liest', () => {
    const ordner = join(WEB, '..', 'server', 'src');
    const pfade = readdirSync(ordner, { recursive: true, encoding: 'utf8' })
      .filter((datei) => datei.endsWith('.controller.ts'))
      .flatMap((datei) => {
        const treffer = /@Controller\('([^']+)'\)/u.exec(
          readFileSync(join(ordner, datei), 'utf8'),
        );

        return treffer === null ? [] : [`/${treffer[1]}/`];
      })
      .filter(
        (pfad) => pfad.startsWith('/public/') || pfad === '/appointments/feed/',
      );

    expect(pfade).toContain('/appointments/feed/');

    for (const pfad of pfade) {
      expect(
        GESPERRTE_PFADE.some((gesperrt) => pfad.startsWith(gesperrt)),
      ).toBe(true);
    }
  });

  it('nennt ohne Adresse keine Sitemap', () => {
    expect(robotsTxt('')).not.toContain('Sitemap');
  });

  it('sperrt keine öffentliche Seite', () => {
    for (const seite of OEFFENTLICHE_SEITEN) {
      expect(GESPERRTE_PFADE.some((pfad) => seite.pfad.startsWith(pfad))).toBe(
        false,
      );
    }
  });
});

describe('sitemap.xml', () => {
  it('nennt jede Seite mit absoluter Adresse', () => {
    const xml = sitemapXml('https://stegwerk.example', ['/', '/funktionen']);

    expect(xml).toContain('<loc>https://stegwerk.example/</loc>');
    expect(xml).toContain('<loc>https://stegwerk.example/funktionen</loc>');
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
  });

  it('maskiert, was in XML eine Bedeutung hat', () => {
    expect(sitemapXml('https://a.example', ['/x&y'])).toContain(
      '<loc>https://a.example/x&amp;y</loc>',
    );
  });
});

describe('herkunftAus', () => {
  it('nimmt eine Adresse ohne Schrägstrich am Ende', () => {
    expect(herkunftAus(' https://stegwerk.example/ ')).toBe(
      'https://stegwerk.example',
    );
  });

  it('verwirft, was keine Adresse ist', () => {
    expect(herkunftAus('stegwerk.example')).toBe('');
    expect(herkunftAus('https://a.example/"><script>')).toBe('');
    expect(herkunftAus(undefined)).toBe('');
  });
});

describe('vorgerenderteSeite', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const seite = vorgerenderteSeite(html, {
    pfad: '/funktionen/e-rechnung',
    titel: 'E-Rechnung',
    beschreibung: 'Rechnungen "mit" <ZUGFeRD> & XRechnung',
    inhalt: '<main><h1>E-Rechnung</h1></main>',
    herkunft: 'https://stegwerk.example',
  });

  it('setzt Titel, Beschreibung und Vorschau der Seite', () => {
    expect(seite).toContain('<title>E-Rechnung · Stegwerk</title>');
    expect(seite).toContain(
      'content="Rechnungen &quot;mit&quot; &lt;ZUGFeRD&gt; &amp; XRechnung"',
    );
    expect(seite).toContain(
      '<meta property="og:title" content="E-Rechnung · Stegwerk" />',
    );
    expect(seite).toContain(
      '<meta property="og:url" content="https://stegwerk.example/funktionen/e-rechnung" />',
    );
    expect(seite).toContain(
      '<link rel="canonical" href="https://stegwerk.example/funktionen/e-rechnung" />',
    );
  });

  it('legt den Inhalt in ein eigenes Element im #root', () => {
    expect(seite).toContain(
      '<div id="root"><div data-vorgerendert><main><h1>E-Rechnung</h1></main></div></div>',
    );
  });

  it('lässt ohne Adresse canonical weg und die Startseite unverändert im Kopf', () => {
    const start = vorgerenderteSeite(html, {
      pfad: '/',
      titel: '',
      beschreibung: '',
      inhalt: 'x',
      herkunft: '',
    });

    expect(start).not.toContain('rel="canonical"');
    expect(start).toContain('<title>Stegwerk</title>');
  });

  it('ändert nichts am Skript in der Seite', () => {
    const skript = /<script>[\s\S]*?<\/script>/u;

    expect(skript.exec(seite)?.[0]).toBe(skript.exec(html)?.[0]);
  });
});

describe('die öffentlichen Seiten', () => {
  const app = readFileSync(join(WEB, 'src/App.tsx'), 'utf8');
  const routen = [...app.matchAll(/path="([^"]+)"/gu)].map(
    (treffer) =>
      new RegExp(
        `^${treffer[1].replace(/:[a-z]+/giu, '[a-z0-9-]+').replace(/\*/gu, '.*')}$`,
        'u',
      ),
  );

  it('hat für jede Adresse der Sitemap eine Route', () => {
    for (const seite of OEFFENTLICHE_SEITEN) {
      const ohneStern = routen.filter((route) => route.source !== '^.*$');

      expect([
        seite.pfad,
        ohneStern.some((route) => route.test(seite.pfad)),
      ]).toEqual([seite.pfad, true]);
    }
  });

  it('nennt jede Adresse einmal', () => {
    const pfade = OEFFENTLICHE_SEITEN.map((seite) => seite.pfad);

    expect(new Set(pfade).size).toBe(pfade.length);
  });

  it('rendert die Funktionen, die Doku und die Fehlerbehebung vor', () => {
    const vor = OEFFENTLICHE_SEITEN.filter((seite) => seite.vorrendern).map(
      (seite) => seite.pfad,
    );

    expect(vor).toEqual(
      expect.arrayContaining([
        '/',
        '/funktionen',
        ...PRODUKTSEITEN.map((seite) => `/funktionen/${seite.slug}`),
        '/entwickler',
        '/entwickler/referenz',
        FEHLERBEHEBUNG_PFAD,
      ]),
    );
  });

  it('legt jede vorgerenderte Seite dorthin, wo nginx sie sucht', () => {
    const nginx = readFileSync(join(WEB, 'nginx.conf'), 'utf8');
    const bereich =
      /location ~ (\^[^ ]+) \{\n[^}]*try_files \$uri\/index\.html/u.exec(
        nginx,
      )?.[1];

    expect(bereich).toBeDefined();

    const muster = new RegExp(bereich ?? '$^', 'u');

    for (const seite of OEFFENTLICHE_SEITEN.filter((s) => s.vorrendern)) {
      if (seite.pfad === '/') {
        expect(vorgerenderteDatei(seite.pfad)).toBe('start.html');
        expect(nginx).toContain('try_files /start.html /index.html;');
      } else {
        expect([seite.pfad, muster.test(seite.pfad)]).toEqual([
          seite.pfad,
          true,
        ]);
        expect(vorgerenderteDatei(seite.pfad)).toBe(
          `${seite.pfad.slice(1)}/index.html`,
        );
      }
    }
  });

  it('hat Titel und Beschreibung von Suchmaschinen-Länge', () => {
    for (const seite of OEFFENTLICHE_SEITEN.filter(
      (s) => s.vorrendern && s.pfad !== '/',
    )) {
      expect(seite.titel.length).toBeGreaterThan(3);
      expect(seite.beschreibung.length).toBeGreaterThan(50);
      expect(seite.beschreibung.length).toBeLessThanOrEqual(170);
    }
  });
});
