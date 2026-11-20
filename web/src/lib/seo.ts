export const herkunftAus = (roh: string | undefined): string => {
  const sauber = (roh ?? '').trim().replace(/\/+$/u, '');

  return /^https?:\/\/[^\s"'<>]+$/u.test(sauber) ? sauber : '';
};

export const GESPERRTE_PFADE = [
  '/angebot/',
  '/formular/',
  '/abmelden/',
  '/einladung/',
  '/passwort-neu/',
  '/adresse-bestaetigen/',
  '/email-aendern/',
  '/public/',
  '/appointments/feed/',
  '/graphql',
  '/oauth/',
  '/mcp',
];

export const robotsTxt = (herkunft: string): string =>
  [
    'User-agent: *',
    'Allow: /',
    ...GESPERRTE_PFADE.map((pfad) => `Disallow: ${pfad}`),
    ...(herkunft === '' ? [] : ['', `Sitemap: ${herkunft}/sitemap.xml`]),
    '',
  ].join('\n');

const xml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const sitemapXml = (herkunft: string, pfade: string[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pfade.map(
      (pfad) =>
        `  <url><loc>${xml(`${herkunft}${pfad === '/' ? '/' : pfad}`)}</loc></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

const attribut = (text: string): string => xml(text);

const setzeMeta = (
  html: string,
  schluessel: 'name' | 'property',
  wert: string,
  inhalt: string,
): string =>
  html.replace(
    new RegExp(
      `(<meta\\s+${schluessel}="${wert.replace(/[.]/gu, '\\$&')}"\\s+content=")[^"]*(")`,
      'u',
    ),
    `$1${attribut(inhalt)}$2`,
  );

export const vorgerenderteSeite = (
  html: string,
  seite: {
    pfad: string;
    titel: string;
    beschreibung: string;
    inhalt: string;
    herkunft: string;
  },
): string => {
  let ergebnis = html;

  if (seite.titel !== '') {
    const titel = `${seite.titel} · Stegwerk`;

    ergebnis = ergebnis
      .replace(/<title>[^<]*<\/title>/u, `<title>${xml(titel)}</title>`)
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*(")/u,
        `$1${attribut(seite.beschreibung)}$2`,
      );
    ergebnis = setzeMeta(ergebnis, 'property', 'og:title', titel);
    ergebnis = setzeMeta(
      ergebnis,
      'property',
      'og:description',
      seite.beschreibung,
    );
  }

  if (seite.herkunft !== '') {
    const adresse = `${seite.herkunft}${seite.pfad}`;

    ergebnis = setzeMeta(ergebnis, 'property', 'og:url', adresse).replace(
      '</head>',
      `  <link rel="canonical" href="${attribut(adresse)}" />\n  </head>`,
    );
  }

  return ergebnis.replace(
    '<div id="root"></div>',
    `<div id="root"><div data-vorgerendert>${seite.inhalt}</div></div>`,
  );
};
