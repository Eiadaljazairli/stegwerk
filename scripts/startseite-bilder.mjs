import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';

const QUELLE = process.env.WEB_URL ?? 'http://localhost:5273';
const ZIEL = process.argv[2] ?? 'web/public/startseite';
const { E_MAIL, PASSWORT } = process.env;

if (!E_MAIL || !PASSWORT) {
  console.error('E_MAIL und PASSWORT setzen.');
  process.exit(1);
}

const b = await chromium.launch({
  ...(process.env.EXECUTABLE_PATH
    ? { executablePath: process.env.EXECUTABLE_PATH }
    : {}),
  env: { ...process.env, LANG: 'de_DE.UTF-8', LANGUAGE: 'de' },
});
const ctx = await b.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: 'de-DE',
});
await ctx.route(
  (u) => u.pathname === '/live',
  (r) => r.abort(),
);
const s = await ctx.newPage();

await s.goto(`${QUELLE}/anmelden`);
await s.evaluate(() => localStorage.setItem('stegwerk.theme', 'light'));
await s.fill('input[type=email]', E_MAIL);
await s.fill('input[type=password]', PASSWORT);
await s.click('button[type=submit]');
await s.waitForURL((u) => !u.pathname.startsWith('/anmelden'), {
  timeout: 20000,
});

const AUSBLENDEN = `
  .erste-schritte, .favoriten-karte, .neu-hinweis, .banner,
  .toast, .live-hinweis { display: none !important; }
`;

const ordner = mkdtempSync(join(tmpdir(), 'startseite-'));

const aufnehmen = async (name, pfad, hoehe, vorher) => {
  await s.setViewportSize({ width: 1280, height: hoehe });
  await s.goto(`${QUELLE}${pfad}`);
  await s.addStyleTag({ content: AUSBLENDEN });
  await s.waitForTimeout(1500);
  if (vorher) {
    await vorher();
    await s.waitForTimeout(1200);
  }
  await s.mouse.move(0, hoehe - 1);
  const png = join(ordner, `${name}.png`);
  await s.screenshot({ path: png });
  execFileSync('python3', [
    '-I',
    '-c',
    'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=82, method=6)',
    png,
    join(ZIEL, `${name}.webp`),
  ]);
  console.log('ok', name);
};

await aufnehmen('board', '/geschaefte', 650, () =>
  s.getByRole('button', { name: 'Board' }).click(),
);
await aufnehmen('uebersicht', '/', 800);
await aufnehmen('kalender', '/kalender', 800);

await b.close();
rmSync(ordner, { recursive: true, force: true });
