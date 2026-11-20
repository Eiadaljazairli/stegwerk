import { chromium } from 'playwright';

const ZIEL = process.argv[2] ?? 'web/public/og-image.png';
const QUELLE = process.env.WEB_URL ?? 'http://localhost:5273';
const b = await chromium.launch(
  process.env.EXECUTABLE_PATH
    ? { executablePath: process.env.EXECUTABLE_PATH }
    : {},
);
const s = await b.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

await s.goto(`${QUELLE}/anmelden`);
await s.waitForTimeout(1500);

await s.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
  document.body.innerHTML = `
    <div id="karte">
      <span class="wordmark" style="font-size:96px">Stegwerk</span>
      <div id="zeile">CRM für Vertriebsteams</div>
    </div>`;
  const stil = document.createElement('style');
  stil.textContent = `
    html, body { margin:0; padding:0; background: var(--chrome); }
    #karte {
      width:1200px; height:630px; box-sizing:border-box;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap: 26px;
      background: var(--chrome);
      /* Genau wie die Kopfleiste: Schrift in --chrome-text. */
      --wordmark-color: var(--chrome-text);
    }
    #zeile {
      color: var(--chrome-muted);
      font-size: 38px;
      font-weight: 500;
      letter-spacing: 0.005em;
    }`;
  document.head.appendChild(stil);
});
await s.waitForTimeout(400);

const masse = await s.evaluate(() => {
  const r = document.querySelector('.wordmark').getBoundingClientRect();
  const z = document.querySelector('#zeile').getBoundingClientRect();
  return {
    marke: [Math.round(r.left), Math.round(r.width)],
    zeile: [Math.round(z.left), Math.round(z.width)],
    schrift: getComputedStyle(
      document.querySelector('.wordmark'),
    ).fontFamily.slice(0, 40),
  };
});
console.log('MASSE', JSON.stringify(masse));
await s.screenshot({
  path: ZIEL,
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await b.close();
