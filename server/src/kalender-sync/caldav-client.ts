import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import { istPrivateAdresse, UngueltigesZiel } from '../webhooks/webhook-ziel';

export type HttpAnfrage = {
  methode: string;
  url: URL;
  kopf: Record<string, string>;
  rumpf?: string;
};

export type HttpAntwort = {
  status: number;
  kopf: Record<string, string>;
  rumpf: string;
};

export type Transport = (anfrage: HttpAnfrage) => Promise<HttpAntwort>;

export class KalenderFehler extends Error {}

const ZEITLIMIT_MS = 20_000;
const HOECHSTENS_BYTES = 5 * 1024 * 1024;

export const pruefeKalenderUrl = (roh: string, erlaubeIntern: boolean): URL => {
  let url: URL;

  try {
    url = new URL(roh.trim());
  } catch {
    throw new UngueltigesZiel('Das ist keine gültige Adresse.');
  }

  if (
    url.protocol !== 'https:' &&
    !(erlaubeIntern && url.protocol === 'http:')
  ) {
    throw new UngueltigesZiel('Kalender werden nur über https verbunden.');
  }

  if (url.username !== '' || url.password !== '') {
    throw new UngueltigesZiel('Zugangsdaten gehören nicht in die Adresse.');
  }

  const host = url.hostname.replace(/^\[|\]$/gu, '');

  if (
    !erlaubeIntern &&
    (host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      (isIP(host) !== 0 && istPrivateAdresse(host)))
  ) {
    throw new UngueltigesZiel('Interne Adressen sind nicht erlaubt.');
  }

  return url;
};

export const sichererTransport =
  (erlaubeIntern: boolean): Transport =>
  (anfrage) =>
    new Promise((fertig, fehler) => {
      const rumpf = anfrage.rumpf ?? '';
      const req = (
        anfrage.url.protocol === 'https:' ? httpsRequest : httpRequest
      )(
        anfrage.url,
        {
          method: anfrage.methode,
          headers: {
            ...anfrage.kopf,
            ...(anfrage.rumpf === undefined
              ? {}
              : { 'content-length': String(Buffer.byteLength(rumpf)) }),
          },
          timeout: ZEITLIMIT_MS,
          lookup: ((
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
                  adressen.some((eintrag) =>
                    istPrivateAdresse(eintrag.address),
                  ))
              ) {
                rueckruf(
                  new UngueltigesZiel(
                    'Die Adresse zeigt auf ein internes Netz.',
                  ),
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
          }) as never,
        },
        (antwort) => {
          const stuecke: Buffer[] = [];
          let groesse = 0;

          antwort.on('data', (stueck: Buffer) => {
            groesse += stueck.length;

            if (groesse > HOECHSTENS_BYTES) {
              req.destroy(new KalenderFehler('Die Antwort ist zu groß.'));

              return;
            }

            stuecke.push(stueck);
          });
          antwort.on('end', () => {
            const kopf: Record<string, string> = {};

            for (const [name, wert] of Object.entries(antwort.headers)) {
              if (wert !== undefined) {
                kopf[name.toLowerCase()] = Array.isArray(wert)
                  ? wert.join(', ')
                  : wert;
              }
            }

            fertig({
              status: antwort.statusCode ?? 0,
              kopf,
              rumpf: Buffer.concat(stuecke).toString('utf8'),
            });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new KalenderFehler('Der Kalenderserver antwortet nicht.'));
      });
      req.on('error', fehler);
      req.end(rumpf);
    });

const entities = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, zahl: string) =>
      String.fromCodePoint(Number(zahl)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, zahl: string) =>
      String.fromCodePoint(parseInt(zahl, 16)),
    )
    .replace(/&amp;/g, '&');

const ohneKuerzel = (xml: string): string =>
  xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');

const innen = (xml: string, tag: string): string | null => {
  const treffer = new RegExp(
    `<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`,
    'i',
  ).exec(xml);

  return treffer === null ? null : (treffer[1] ?? '');
};

const alle = (xml: string, tag: string): string[] =>
  [
    ...xml.matchAll(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'),
    ),
  ].map((treffer) => treffer[1]);

export type DavAntwort = {
  href: string;
  eigenschaften: string;
};

export const davAntworten = (xml: string): DavAntwort[] =>
  alle(ohneKuerzel(xml), 'response').map((teil) => {
    const propstats = alle(teil, 'propstat');
    const gut = propstats.filter((stat) => {
      const status = innen(stat, 'status');

      return status === null || / 2\d\d /.test(` ${status} `);
    });

    return {
      href: entities((innen(teil, 'href') ?? '').trim()),
      eigenschaften: (gut.length > 0 ? gut : [teil]).join('\n'),
    };
  });

export type GefundenerKalender = { url: string; name: string };

export type KalenderObjekt = { href: string; etag: string | null; ics: string };

const PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;

const KALENDER = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

const zeitIcs = (zeit: Date): string =>
  zeit
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export type Ablageergebnis = {
  etag: string | null;
  konflikt: boolean;
  href?: string;
};

export interface KalenderKlient {
  entdecken(basis: string): Promise<GefundenerKalender[]>;
  neueAdresse(kalenderUrl: string, name: string): string;
  ablegen(
    href: string,
    ics: string,
    bedingung?: { etag?: string | null; erzwingen?: boolean },
  ): Promise<Ablageergebnis>;
  loeschen(href: string): Promise<void>;
  abfragen(
    kalenderUrl: string,
    von: Date,
    bis: Date,
  ): Promise<KalenderObjekt[]>;
  holen(href: string): Promise<KalenderObjekt | null>;
}

export type CalDavOptionen = {
  bearer?: () => Promise<string>;
  nurHosts?: ReadonlySet<string>;
};

export class CalDavClient implements KalenderKlient {
  constructor(
    protected readonly transport: Transport,
    private readonly benutzer: string,
    private readonly passwort: string,
    private readonly erlaubeIntern: boolean,
    protected readonly optionen: CalDavOptionen = {},
  ) {}

  neueAdresse(kalenderUrl: string, name: string): string {
    return new URL(`${name}.ics`, kalenderUrl).toString();
  }

  protected pruefeHost(url: URL): void {
    if (
      this.optionen.nurHosts !== undefined &&
      (url.protocol !== 'https:' || !this.optionen.nurHosts.has(url.hostname))
    ) {
      throw new KalenderFehler('Unerwartete Adresse des Kalenderanbieters.');
    }
  }

  private async anmeldung(): Promise<string> {
    if (this.optionen.bearer !== undefined) {
      return `Bearer ${await this.optionen.bearer()}`;
    }

    return `Basic ${Buffer.from(`${this.benutzer}:${this.passwort}`).toString(
      'base64',
    )}`;
  }

  protected async anfrage(
    methode: string,
    ziel: URL,
    rumpf?: string,
    kopf: Record<string, string> = {},
  ): Promise<HttpAntwort> {
    let url = ziel;

    for (let runde = 0; runde < 4; runde += 1) {
      pruefeKalenderUrl(url.toString(), this.erlaubeIntern);
      this.pruefeHost(url);

      const antwort = await this.transport({
        methode,
        url,
        kopf: {
          authorization: await this.anmeldung(),
          'user-agent': 'Stegwerk-Kalender/1.0',
          ...(rumpf === undefined
            ? {}
            : { 'content-type': 'application/xml; charset=utf-8' }),
          ...kopf,
        },
        rumpf,
      });

      if ([301, 302, 307, 308].includes(antwort.status)) {
        const weiter = antwort.kopf.location;

        if (weiter === undefined) {
          return antwort;
        }

        url = new URL(weiter, url);
        continue;
      }

      if (antwort.status === 401 || antwort.status === 403) {
        throw new KalenderFehler(
          this.optionen.bearer === undefined
            ? 'Der Kalenderserver hat die Anmeldung abgelehnt. Bitte Benutzer und App-Passwort prüfen.'
            : 'Der Kalenderanbieter hat den Zugriff abgelehnt. Bitte neu verbinden.',
        );
      }

      return antwort;
    }

    throw new KalenderFehler('Zu viele Weiterleitungen.');
  }

  private href(basis: URL, wert: string): URL {
    return new URL(wert, basis);
  }

  async entdecken(basisRoh: string): Promise<GefundenerKalender[]> {
    let basis = pruefeKalenderUrl(basisRoh, this.erlaubeIntern);
    let principal = await this.anfrage('PROPFIND', basis, PRINCIPAL, {
      depth: '0',
    });

    if (principal.status !== 207) {
      basis = new URL('/.well-known/caldav', basis);
      principal = await this.anfrage('PROPFIND', basis, PRINCIPAL, {
        depth: '0',
      });
    }

    if (principal.status !== 207) {
      throw new KalenderFehler(
        'Unter dieser Adresse antwortet kein CalDAV-Server.',
      );
    }

    const principalHref = innen(
      innen(ohneKuerzel(principal.rumpf), 'current-user-principal') ?? '',
      'href',
    );
    let heimat = basis;

    if (principalHref !== null && principalHref.trim() !== '') {
      const principalUrl = this.href(basis, entities(principalHref.trim()));
      const home = await this.anfrage('PROPFIND', principalUrl, HOME, {
        depth: '0',
      });
      const homeHref = innen(
        innen(ohneKuerzel(home.rumpf), 'calendar-home-set') ?? '',
        'href',
      );

      if (home.status === 207 && homeHref !== null && homeHref.trim() !== '') {
        heimat = this.href(principalUrl, entities(homeHref.trim()));
      }
    }

    const liste = await this.anfrage('PROPFIND', heimat, KALENDER, {
      depth: '1',
    });

    if (liste.status !== 207) {
      throw new KalenderFehler('Die Kalender ließen sich nicht abrufen.');
    }

    return davAntworten(liste.rumpf)
      .filter((antwort) => {
        const typ = innen(antwort.eigenschaften, 'resourcetype') ?? '';
        const komponenten =
          innen(antwort.eigenschaften, 'supported-calendar-component-set') ??
          '';

        return (
          /<calendar[\s/>]/i.test(typ) &&
          (komponenten.trim() === '' || /VEVENT/i.test(komponenten))
        );
      })
      .map((antwort) => {
        const url = this.href(heimat, antwort.href).toString();
        const name = entities(
          (innen(antwort.eigenschaften, 'displayname') ?? '').trim(),
        );

        return {
          url: url.endsWith('/') ? url : `${url}/`,
          name:
            name === ''
              ? decodeURIComponent(
                  url.split('/').filter(Boolean).pop() ?? 'Kalender',
                )
              : name,
        };
      });
  }

  async ablegen(
    href: string,
    ics: string,
    bedingung: { etag?: string | null; erzwingen?: boolean } = {},
  ): Promise<Ablageergebnis> {
    const kopf: Record<string, string> = {
      'content-type': 'text/calendar; charset=utf-8',
    };

    if (bedingung.erzwingen !== true) {
      if (bedingung.etag !== undefined && bedingung.etag !== null) {
        kopf['if-match'] = bedingung.etag;
      } else if (bedingung.etag === undefined) {
        kopf['if-none-match'] = '*';
      }
    }

    const antwort = await this.anfrage('PUT', new URL(href), ics, kopf);

    if (antwort.status === 412) {
      return { etag: null, konflikt: true };
    }

    if (antwort.status < 200 || antwort.status >= 300) {
      throw new KalenderFehler(
        `Der Kalender hat den Termin nicht angenommen (${String(antwort.status)}).`,
      );
    }

    return { etag: antwort.kopf.etag ?? null, konflikt: false };
  }

  async loeschen(href: string): Promise<void> {
    const antwort = await this.anfrage('DELETE', new URL(href));

    if (
      antwort.status !== 404 &&
      antwort.status !== 410 &&
      (antwort.status < 200 || antwort.status >= 300)
    ) {
      throw new KalenderFehler(
        `Der Kalender hat das Löschen abgelehnt (${String(antwort.status)}).`,
      );
    }
  }

  async abfragen(
    kalenderUrl: string,
    von: Date,
    bis: Date,
  ): Promise<KalenderObjekt[]> {
    const rumpf = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${zeitIcs(von)}" end="${zeitIcs(bis)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
    const basis = new URL(kalenderUrl);
    const antwort = await this.anfrage('REPORT', basis, rumpf, { depth: '1' });

    if (antwort.status !== 207) {
      throw new KalenderFehler(
        `Der Kalender ließ sich nicht abfragen (${String(antwort.status)}).`,
      );
    }

    return davAntworten(antwort.rumpf).flatMap((eintrag) => {
      const ics = innen(eintrag.eigenschaften, 'calendar-data');

      if (ics === null || ics.trim() === '') {
        return [];
      }

      const etag = innen(eintrag.eigenschaften, 'getetag');
      const ziel = this.href(basis, eintrag.href);

      if (ziel.origin !== basis.origin) {
        return [];
      }

      return [
        {
          href: ziel.toString(),
          etag: etag === null ? null : entities(etag.trim()),
          ics: entities(ics),
        },
      ];
    });
  }

  async holen(href: string): Promise<KalenderObjekt | null> {
    const antwort = await this.anfrage('GET', new URL(href));

    if (antwort.status === 404 || antwort.status === 410) {
      return null;
    }

    if (antwort.status < 200 || antwort.status >= 300) {
      throw new KalenderFehler(
        `Der Termin ließ sich nicht laden (${String(antwort.status)}).`,
      );
    }

    return { href, etag: antwort.kopf.etag ?? null, ics: antwort.rumpf };
  }
}
