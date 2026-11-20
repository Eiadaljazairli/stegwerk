#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const BUENDEL = join(WEB, 'dist-vorrendern');

const { SEITEN, rendere, herkunftAus, vorgerenderteDatei, vorgerenderteSeite } =
  await import(pathToFileURL(join(BUENDEL, 'vorrendern.js')).href);

const vorlage = readFileSync(join(DIST, 'index.html'), 'utf8');
const herkunft = herkunftAus(process.env.VITE_PUBLIC_ORIGIN);

for (const seite of SEITEN) {
  const ziel = join(DIST, vorgerenderteDatei(seite.pfad));

  mkdirSync(dirname(ziel), { recursive: true });
  writeFileSync(
    ziel,
    vorgerenderteSeite(vorlage, {
      ...seite,
      inhalt: rendere(seite.pfad),
      herkunft,
    }),
  );
}

rmSync(BUENDEL, { recursive: true, force: true });

// oxlint-disable-next-line no-console
console.log(`${String(SEITEN.length)} Seiten vorgerendert.`);
