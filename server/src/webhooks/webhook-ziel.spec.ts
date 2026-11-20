import { createServer as httpServer, type Server } from 'node:http';
import { createServer as netServer, type AddressInfo } from 'node:net';

import {
  istPrivateAdresse,
  pruefeZielForm,
  sichereRoheAnfrage,
  sichererPost,
  UngueltigesZiel,
} from './webhook-ziel';

describe('istPrivateAdresse', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::1',
    '2001:0:4136:e378::1',
    '2001:db8::1',
    'fec0::1',
    '::',
    'kein-ip',
  ])('%s ist intern', (adresse) => {
    expect(istPrivateAdresse(adresse)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '93.184.216.34',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
    '2002:808:808::1',
  ])('%s ist öffentlich', (adresse) => {
    expect(istPrivateAdresse(adresse)).toBe(false);
  });
});

describe('pruefeZielForm', () => {
  it('nimmt eine https-Adresse', () => {
    expect(pruefeZielForm('https://hooks.example.com/stegwerk').hostname).toBe(
      'hooks.example.com',
    );
  });

  it.each([
    ['http ohne Erlaubnis', 'http://hooks.example.com'],
    ['localhost', 'https://localhost/x'],
    ['eine interne IP', 'https://10.0.0.5/x'],
    ['die Metadatenadresse', 'https://169.254.169.254/latest'],
    ['Zugangsdaten', 'https://nutzer:geheim@hooks.example.com'],
    ['Unsinn', 'kein link'],
    ['IPv4 in IPv6, hexadezimal', 'https://[::ffff:127.0.0.1]/x'],
    ['Metadaten über NAT64', 'https://[64:ff9b::a9fe:a9fe]/x'],
  ])('lehnt %s ab', (_fall, adresse) => {
    expect(() => pruefeZielForm(adresse)).toThrow(UngueltigesZiel);
  });

  it('erlaubt http nur, wenn ausdrücklich gewünscht', () => {
    expect(pruefeZielForm('http://hooks.example.com', true).protocol).toBe(
      'http:',
    );
  });
});

describe('sichererPost', () => {
  it('verbindet nicht, wenn der Name auf eine interne Adresse zeigt', async () => {
    await expect(
      sichererPost(new URL('https://localhost:9/x'), {}, '{}', 2000),
    ).rejects.toBeInstanceOf(UngueltigesZiel);
  });
});

describe('Gesamtfrist', () => {
  const offen: { close: () => void }[] = [];
  const takte: ReturnType<typeof setInterval>[] = [];

  afterEach(() => {
    takte.splice(0).forEach(clearInterval);
    offen.splice(0).forEach((server) => server.close());
  });

  const lauscht = async (server: Server | ReturnType<typeof netServer>) => {
    offen.push(server);
    await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));

    return (server.address() as AddressInfo).port;
  };

  it('bricht eine Antwort ab, die tröpfelnd nie endet', async () => {
    const port = await lauscht(
      httpServer((_anfrage, antwort) => {
        antwort.writeHead(200, { 'content-type': 'text/html' });
        takte.push(setInterval(() => antwort.write('x'), 100));
      }),
    );
    const start = Date.now();

    await expect(
      sichereRoheAnfrage(
        new URL(`http://127.0.0.1:${port}/`),
        'GET',
        {},
        null,
        500,
        1024 * 1024,
        true,
      ),
    ).rejects.toThrow('Keine Antwort in der Zeit.');
    expect(Date.now() - start).toBeLessThan(1_500);
  });

  it('bricht beim Webhook einen Kopf ab, der tröpfelnd nie endet', async () => {
    const kopf = 'HTTP/1.1 200 OK\r\nX-Lang: ';
    const port = await lauscht(
      netServer((leitung) => {
        leitung.on('error', () => undefined);
        leitung.write(kopf);
        takte.push(setInterval(() => leitung.write('x'), 100));
        offen.push({ close: () => leitung.destroy() });
      }),
    );
    const start = Date.now();

    await expect(
      sichererPost(new URL(`http://127.0.0.1:${port}/`), {}, '{}', 500, true),
    ).rejects.toThrow('Keine Antwort in der Zeit.');
    expect(Date.now() - start).toBeLessThan(1_500);
  });

  it('lässt eine zügige Antwort durch und hält danach nichts offen', async () => {
    const port = await lauscht(
      httpServer((_anfrage, antwort) => {
        antwort.writeHead(200, { 'content-type': 'text/plain' });
        antwort.end('fertig');
      }),
    );
    const antwort = await sichereRoheAnfrage(
      new URL(`http://127.0.0.1:${port}/`),
      'GET',
      {},
      null,
      500,
      1024,
      true,
    );

    expect(antwort.bytes.toString()).toBe('fertig');
    await new Promise((fertig) => setTimeout(fertig, 700));
  });
});
