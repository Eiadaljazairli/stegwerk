import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { OEFFENTLICHE_SEITEN } from './src/lib/oeffentliche-seiten';
import { herkunftAus, robotsTxt, sitemapXml } from './src/lib/seo';

const herkunft = (): string => herkunftAus(process.env.VITE_PUBLIC_ORIGIN);

const vorschau = (): Plugin => ({
  name: 'stegwerk-vorschau',
  transformIndexHtml: (html) =>
    html.replaceAll('%STEGWERK_HERKUNFT%', herkunft()),
});

const ohneKommentare = (): Plugin => ({
  name: 'stegwerk-ohne-kommentare',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html
        .replace(/<!--[\s\S]*?-->/gu, '')
        .replace(/^[ \t]*\/\/.*$/gmu, '')
        .replace(/\n[ \t]*(?=\n)/gu, ''),
  },
});

const FASSUNG =
  (process.env.APP_VERSION ?? '').trim().replace(/[^\w.:-]/gu, '') ||
  new Date().toISOString();

const fassung = (): Plugin => ({
  name: 'stegwerk-fassung',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: `${JSON.stringify({ version: FASSUNG })}\n`,
    });
  },
});

const suchmaschinen = (): Plugin => ({
  name: 'stegwerk-suchmaschinen',
  apply: 'build',
  generateBundle() {
    const adresse = herkunft();

    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: robotsTxt(adresse),
    });

    if (adresse !== '') {
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemapXml(
          adresse,
          OEFFENTLICHE_SEITEN.map((seite) => seite.pfad),
        ),
      });
    }
  },
});

export default defineConfig(({ isSsrBuild }) => ({
  build: { copyPublicDir: isSsrBuild !== true },
  plugins: [react(), vorschau(), ohneKommentare(), fassung(), suchmaschinen()],
  define: {
    __STEGWERK_FASSUNG__: JSON.stringify(FASSUNG),
  },
  server: {
    port: Number(process.env.PORT ?? 5273),
    strictPort: false,
  },
}));
