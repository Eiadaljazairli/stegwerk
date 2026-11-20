import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import {
  abrufbar,
  AbrufFehler,
  holen,
  USER_AGENT,
  VorgangErschoepft,
  ZEITLIMIT_MS,
} from './abruf';
import { BereichsDrossel, Vorgang } from './drossel';
import { bildArt, logoKandidaten } from './logo';

export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 1),
]);

describe('Bildart am Inhalt', () => {
  it('erkennt PNG, JPEG, GIF, WebP und ICO', () => {
    expect(bildArt(PNG)).toBe('image/png');
    expect(bildArt(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(
      'image/jpeg',
    );
    expect(bildArt(Buffer.from('GIF89a......'))).toBe('image/gif');
    expect(bildArt(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 '))).toBe(
      'image/webp',
    );
    expect(
      bildArt(
        Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(20)]),
      ),
    ).toBe('image/x-icon');
  });

  it('nimmt kein SVG, kein HTML und nichts Leeres, egal was der Server behauptet', () => {
    expect(
      bildArt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(bildArt(Buffer.from('<!DOCTYPE html><html>'))).toBeNull();
    expect(bildArt(Buffer.alloc(0))).toBeNull();
    expect(
      bildArt(
        Buffer.concat([Buffer.from([0, 0, 1, 0, 0, 0]), Buffer.alloc(20)]),
      ),
    ).toBeNull();
  });
});

describe('Wo das Logo liegen könnte', () => {
  const basis = new URL('https://www.firma.de/start/');

  it('versucht apple-touch-icon, dann große Favicons, dann og:image, zuletzt /favicon.ico; SVG nie', () => {
    const html = `<head>
      <meta property="og:image" content="https://cdn.firma.de/teaser.jpg">
      <link rel="icon" type="image/svg+xml" href="/logo.svg">
      <link rel="icon" href="/fav-16.png" sizes="16x16">
      <link rel="icon" href="/fav-192.png" sizes="192x192">
      <link rel="apple-touch-icon" href="apple.png">
      <link rel="shortcut icon" href="/vektor.svg">
    </head>`;

    expect(logoKandidaten(html, basis).map(String)).toEqual([
      'https://www.firma.de/start/apple.png',
      'https://www.firma.de/fav-192.png',
      'https://www.firma.de/fav-16.png',
      'https://cdn.firma.de/teaser.jpg',
      'https://www.firma.de/favicon.ico',
    ]);
  });

  it('hat ohne Angaben immer noch /favicon.ico und übergeht data: und javascript:', () => {
    const html =
      '<link rel="icon" href="data:image/png;base64,AAA"><link rel="icon" href="javascript:x">';

    expect(logoKandidaten(html, basis).map(String)).toEqual([
      'https://www.firma.de/favicon.ico',
    ]);
  });
});

describe('Abruf mit Schutz', () => {
  let server: Server;
  let basis: string;
  const gesehen: string[] = [];

  beforeAll(async () => {
    server = createServer((anfrage, antwort) => {
      gesehen.push(String(anfrage.headers['user-agent']));

      const pfad = anfrage.url ?? '/';

      if (pfad.startsWith('/weiter/')) {
        const n = Number(pfad.split('/')[2]);

        antwort.writeHead(302, {
          location: n === 0 ? '/ziel' : `/weiter/${String(n - 1)}`,
        });
        antwort.end();

        return;
      }

      if (pfad === '/gross') {
        antwort.writeHead(200, { 'content-type': 'image/png' });
        antwort.end(Buffer.alloc(300 * 1024, 7));

        return;
      }

      if (pfad === '/nach-aussen') {
        antwort.writeHead(301, { location: 'http://10.0.0.1/geheim' });
        antwort.end();

        return;
      }

      antwort.writeHead(200, { 'content-type': 'text/html' });
      antwort.end(`<p>${pfad}</p>`);
    });
    await new Promise<void>((fertig) =>
      server.listen(0, '127.0.0.1', () => fertig()),
    );
    basis = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise((fertig) => server.close(fertig));
  });

  it('folgt höchstens drei Weiterleitungen und meldet sich mit eigenem Namen', async () => {
    const abruf = await holen(new URL(`${basis}/weiter/2`), 1024, '*/*', true);

    expect(abruf.status).toBe(200);
    expect(abruf.url.pathname).toBe('/ziel');
    expect(abruf.bytes.toString()).toBe('<p>/ziel</p>');
    expect(gesehen.at(-1)).toBe(USER_AGENT);

    await expect(
      holen(new URL(`${basis}/weiter/3`), 1024, '*/*', true),
    ).rejects.toThrow(/zu oft weiter/u);
  });

  it('liest nicht mehr als erlaubt', async () => {
    const abruf = await holen(
      new URL(`${basis}/gross`),
      200 * 1024 + 1,
      '*/*',
      true,
    );

    expect(abruf.gekuerzt).toBe(true);
    expect(abruf.bytes.length).toBe(200 * 1024 + 1);
  });

  it('verweigert das eigene Netz und fremde Schemata', async () => {
    await expect(
      holen(new URL(`${basis}/ziel`), 1024, '*/*', false),
    ).rejects.toThrow(AbrufFehler);
    expect(() => abrufbar('http://localhost:5432/', false)).toThrow(
      AbrufFehler,
    );
    expect(() => abrufbar('http://169.254.169.254/latest/', false)).toThrow(
      /Interne/u,
    );
    expect(() => abrufbar('ftp://firma.de/', false)).toThrow(
      /http oder https/u,
    );
    expect(() => abrufbar('https://nutzer:pw@firma.de/', false)).toThrow(
      AbrufFehler,
    );
  });

  it('prüft eine Weiterleitung wie die erste Adresse', async () => {
    const angefragt: string[] = [];
    const anfrager = (url: URL) => {
      angefragt.push(url.toString());

      return Promise.resolve({
        status: 302,
        bytes: Buffer.alloc(0),
        gekuerzt: false,
        typ: null,
        retryAfter: null,
        location: 'http://169.254.169.254/latest/meta-data/',
      });
    };

    await expect(
      holen(
        new URL('https://firma.example/'),
        1024,
        '*/*',
        false,
        anfrager as never,
      ),
    ).rejects.toThrow(/Interne Adressen/u);
    expect(angefragt).toEqual(['https://firma.example/']);
  });

  it('zählt jede Weiterleitung beim Vorgang und bei der Drossel', async () => {
    const drossel = new BereichsDrossel(100, 60_000);
    const vorgang = new Vorgang(drossel, 'w', 10, 30_000);

    await holen(
      new URL(`${basis}/weiter/2`),
      1024,
      '*/*',
      true,
      undefined,
      vorgang,
    );

    const knapp = new Vorgang(drossel, 'w', 3, 30_000);

    await expect(
      holen(new URL(`${basis}/weiter/2`), 1024, '*/*', true, undefined, knapp),
    ).rejects.toThrow(VorgangErschoepft);

    const voll = new BereichsDrossel(7, 60_000);
    const erster = new Vorgang(voll, 'w', 10, 30_000);

    await holen(
      new URL(`${basis}/weiter/2`),
      1024,
      '*/*',
      true,
      undefined,
      erster,
    );
    await holen(
      new URL(`${basis}/weiter/1`),
      1024,
      '*/*',
      true,
      undefined,
      erster,
    );
    await expect(
      holen(new URL(`${basis}/ziel`), 1024, '*/*', true, undefined, erster),
    ).rejects.toThrow(/später/u);
  });
});

describe('Maß je Vorgang', () => {
  it('begrenzt Anzahl und Gesamtzeit und kürzt das Zeitlimit der letzten Anfrage', () => {
    let jetzt = 0;
    const drossel = new BereichsDrossel(100, 60_000, () => jetzt);
    const vorgang = new Vorgang(drossel, 'w', 2, 20_000, () => jetzt);

    expect(vorgang.vorAnfrage()).toBe(ZEITLIMIT_MS);
    jetzt = 15_000;
    expect(vorgang.vorAnfrage()).toBe(5_000);
    expect(() => vorgang.vorAnfrage()).toThrow(VorgangErschoepft);

    const langsam = new Vorgang(drossel, 'w', 10, 20_000, () => jetzt);

    jetzt = 34_500;
    expect(() => langsam.vorAnfrage()).toThrow(VorgangErschoepft);
  });
});

describe('Drossel je Bereich', () => {
  it('lässt das Maß durch, lehnt danach ab und gibt nach dem Zeitraum wieder frei', () => {
    let jetzt = 0;
    const drossel = new BereichsDrossel(2, 1000, () => jetzt);

    drossel.zaehle('a');
    drossel.zaehle('a');
    expect(() => drossel.zaehle('a')).toThrow(/später/u);
    expect(() => drossel.zaehle('b')).not.toThrow();

    jetzt = 1001;
    expect(() => drossel.zaehle('a')).not.toThrow();
  });
});
