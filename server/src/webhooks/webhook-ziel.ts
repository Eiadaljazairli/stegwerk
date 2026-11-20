import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const PRIVAT_V4: [number, number][] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xe0000000, 3],
];

const alsZahl = (adresse: string): number =>
  adresse.split('.').reduce((summe, teil) => summe * 256 + Number(teil), 0);

const v4Privat = (zahl: number): boolean =>
  PRIVAT_V4.some(([netz, laenge]) => {
    const maske = laenge === 0 ? 0 : (0xffffffff << (32 - laenge)) >>> 0;

    return (zahl & maske) >>> 0 === netz >>> 0;
  });

const v6Gruppen = (adresse: string): number[] | null => {
  let text = adresse.toLowerCase().replace(/%.*$/u, '');
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/u.exec(text);

  if (v4 !== null) {
    if (isIP(v4[1]) !== 4) {
      return null;
    }

    const zahl = alsZahl(v4[1]);

    text = `${text.slice(0, -v4[1].length)}${(zahl >>> 16).toString(16)}:${(zahl & 0xffff).toString(16)}`;
  }

  const haelften = text.split('::');

  if (haelften.length > 2) {
    return null;
  }

  const teile = (abschnitt: string) =>
    abschnitt === '' ? [] : abschnitt.split(':');
  const vorn = teile(haelften[0]);
  const hinten = haelften.length === 2 ? teile(haelften[1]) : [];
  const fehlend = 8 - vorn.length - hinten.length;

  if (fehlend < 0 || (haelften.length === 1 && fehlend !== 0)) {
    return null;
  }

  const gruppen = [...vorn, ...Array<string>(fehlend).fill('0'), ...hinten].map(
    (gruppe) => Number.parseInt(gruppe, 16),
  );

  return gruppen.length === 8 &&
    gruppen.every(
      (gruppe) => Number.isInteger(gruppe) && gruppe >= 0 && gruppe <= 0xffff,
    )
    ? gruppen
    : null;
};

const v4Aus = (hoch: number, tief: number): number =>
  ((hoch << 16) | tief) >>> 0;

export const istPrivateAdresse = (adresse: string): boolean => {
  if (isIP(adresse) === 4) {
    return v4Privat(alsZahl(adresse));
  }

  const g = v6Gruppen(adresse);

  if (g === null) {
    return true;
  }

  const nullenBis = (n: number) =>
    g.slice(0, n).every((gruppe) => gruppe === 0);

  if (
    (nullenBis(5) && g[5] === 0xffff) ||
    (nullenBis(6) && (g[6] !== 0 || g[7] > 1)) ||
    (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
  ) {
    return v4Privat(v4Aus(g[6], g[7]));
  }

  if (g[0] === 0x2002) {
    return v4Privat(v4Aus(g[1], g[2]));
  }

  const global = (g[0] & 0xe000) === 0x2000;
  const teredo = g[0] === 0x2001 && g[1] === 0;
  const doku = g[0] === 0x2001 && g[1] === 0xdb8;

  return !global || teredo || doku;
};

export class UngueltigesZiel extends Error {}

export const pruefeZielForm = (
  roh: string,
  erlaubeHttp = false,
  erlaubeIntern = false,
): URL => {
  let url: URL;

  try {
    url = new URL(roh.trim());
  } catch {
    throw new UngueltigesZiel('Das ist keine gültige Adresse.');
  }

  if (url.protocol !== 'https:' && !(erlaubeHttp && url.protocol === 'http:')) {
    throw new UngueltigesZiel('Webhooks gehen nur an https-Adressen.');
  }

  if (url.username !== '' || url.password !== '') {
    throw new UngueltigesZiel('Zugangsdaten gehören nicht in die Adresse.');
  }

  const host = url.hostname.replace(/^\[|\]$/gu, '');

  if (erlaubeIntern) {
    return url;
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new UngueltigesZiel('Interne Adressen sind nicht erlaubt.');
  }

  if (isIP(host) !== 0 && istPrivateAdresse(host)) {
    throw new UngueltigesZiel('Interne Adressen sind nicht erlaubt.');
  }

  return url;
};

export const pruefeZielAufloesung = async (
  url: URL,
  erlaubeIntern = false,
): Promise<void> => {
  const host = url.hostname.replace(/^\[|\]$/gu, '');

  if (erlaubeIntern || isIP(host) !== 0) {
    return;
  }

  const adressen = await lookup(host, { all: true });

  if (
    adressen.length === 0 ||
    adressen.some((eintrag) => istPrivateAdresse(eintrag.address))
  ) {
    throw new UngueltigesZiel('Die Adresse zeigt auf ein internes Netz.');
  }
};

export const sichererPost = (
  url: URL,
  headers: Record<string, string>,
  rumpf: string,
  zeitlimitMs: number,
  erlaubeIntern = false,
): Promise<number> =>
  new Promise((fertig, fehler) => {
    const anfrage = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(rumpf) },
        timeout: zeitlimitMs,
        lookup: pruefendeAufloesung(erlaubeIntern),
      },
      (antwort) => {
        antwort.resume();
        antwort.on('close', () => clearTimeout(frist));
        fertig(antwort.statusCode ?? 0);
      },
    );
    const frist = setTimeout(() => {
      anfrage.destroy(new Error('Keine Antwort in der Zeit.'));
    }, zeitlimitMs);

    anfrage.on('timeout', () => {
      anfrage.destroy(new Error('Keine Antwort in der Zeit.'));
    });
    anfrage.on('error', (problem) => {
      clearTimeout(frist);
      fehler(problem);
    });
    anfrage.end(rumpf);
  });

const pruefendeAufloesung = (erlaubeIntern: boolean) =>
  ((
    host: string,
    optionen: { all?: boolean },
    rueckruf: (
      problem: Error | null,
      adresse: string | LookupAddress[],
      familie?: number,
    ) => void,
  ) => {
    dnsLookup(host, { ...optionen, all: true }, (problem, adressen) => {
      if (problem !== null) {
        rueckruf(problem, '');

        return;
      }

      if (
        !erlaubeIntern &&
        (adressen.length === 0 ||
          adressen.some((eintrag) => istPrivateAdresse(eintrag.address)))
      ) {
        rueckruf(
          new UngueltigesZiel('Die Adresse zeigt auf ein internes Netz.'),
          '',
        );

        return;
      }

      if (optionen.all === true) {
        rueckruf(null, adressen);
      } else {
        rueckruf(null, adressen[0].address, adressen[0].family);
      }
    });
  }) as never;

export type AnfrageAntwort = {
  status: number;
  rumpf: string;
  gekuerzt: boolean;
  typ: string | null;
  retryAfter: string | null;
};

export type RoheAntwort = {
  status: number;
  bytes: Buffer;
  gekuerzt: boolean;
  typ: string | null;
  retryAfter: string | null;
  location: string | null;
};

const kopf = (wert: string | string[] | undefined): string | null =>
  typeof wert === 'string' ? wert : null;

export const sichereRoheAnfrage = (
  url: URL,
  methode: string,
  headers: Record<string, string>,
  rumpf: string | Buffer | null,
  zeitlimitMs: number,
  maxBytes: number,
  erlaubeIntern = false,
): Promise<RoheAntwort> =>
  new Promise((fertig, fehler) => {
    let erledigt = false;
    let frist: ReturnType<typeof setTimeout> | undefined;
    const einmal = (antwort: RoheAntwort) => {
      if (!erledigt) {
        erledigt = true;
        clearTimeout(frist);
        fertig(antwort);
      }
    };
    const scheitern = (problem: Error) => {
      if (!erledigt) {
        erledigt = true;
        clearTimeout(frist);
        fehler(problem);
      }
    };
    const anfrage = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: methode,
        headers:
          rumpf === null
            ? headers
            : { ...headers, 'content-length': Buffer.byteLength(rumpf) },
        timeout: zeitlimitMs,
        lookup: pruefendeAufloesung(erlaubeIntern),
      },
      (antwort) => {
        const teile: Buffer[] = [];
        let laenge = 0;
        let gekuerzt = false;

        antwort.on('data', (teil: Buffer) => {
          if (laenge >= maxBytes) {
            gekuerzt = true;
            antwort.destroy();

            return;
          }

          const rest = maxBytes - laenge;

          teile.push(teil.length > rest ? teil.subarray(0, rest) : teil);
          laenge += Math.min(teil.length, rest);
          gekuerzt ||= teil.length > rest;
        });

        const ende = () =>
          einmal({
            status: antwort.statusCode ?? 0,
            bytes: Buffer.concat(teile),
            gekuerzt,
            typ: kopf(antwort.headers['content-type']),
            retryAfter: kopf(antwort.headers['retry-after']),
            location: kopf(antwort.headers.location),
          });

        antwort.on('end', ende);
        antwort.on('close', ende);
        antwort.on('error', scheitern);
      },
    );

    frist = setTimeout(() => {
      scheitern(new Error('Keine Antwort in der Zeit.'));
      anfrage.destroy();
    }, zeitlimitMs);

    anfrage.on('timeout', () => {
      anfrage.destroy(new Error('Keine Antwort in der Zeit.'));
    });
    anfrage.on('error', scheitern);
    anfrage.end(rumpf ?? undefined);
  });

export const sichereAnfrage = async (
  url: URL,
  methode: string,
  headers: Record<string, string>,
  rumpf: string | Buffer | null,
  zeitlimitMs: number,
  maxBytes: number,
  erlaubeIntern = false,
): Promise<AnfrageAntwort> => {
  const antwort = await sichereRoheAnfrage(
    url,
    methode,
    headers,
    rumpf,
    zeitlimitMs,
    maxBytes,
    erlaubeIntern,
  );

  return {
    status: antwort.status,
    rumpf: antwort.bytes.toString('utf8'),
    gekuerzt: antwort.gekuerzt,
    typ: antwort.typ,
    retryAfter: antwort.retryAfter,
  };
};

export const oeffentlicherWirt = async (
  roh: string,
  erlaubeIntern = false,
): Promise<string> => {
  const host = roh.trim().replace(/^\[|\]$/gu, '');

  if (erlaubeIntern) {
    return host;
  }

  const intern = new UngueltigesZiel(
    'Dieser Server liegt in einem internen Netz und ist nicht erlaubt.',
  );

  if (isIP(host) !== 0) {
    if (istPrivateAdresse(host)) {
      throw intern;
    }

    return host;
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    !host.includes('.')
  ) {
    throw intern;
  }

  const adressen = await lookup(host, { all: true });

  if (
    adressen.length === 0 ||
    adressen.some((eintrag) => istPrivateAdresse(eintrag.address))
  ) {
    throw intern;
  }

  return adressen[0].address;
};

export const internErlaubt = (): boolean =>
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
