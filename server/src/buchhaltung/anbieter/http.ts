import { randomBytes } from 'node:crypto';

import { sichereAnfrage } from '../../webhooks/webhook-ziel';

export const ERLAUBTE_RECHNER = ['api.lexware.io', 'my.sevdesk.de'] as const;

export type HttpAnfrage = {
  methode: 'GET' | 'POST' | 'PUT';
  url: string;
  headers: Record<string, string>;
  rumpf?: string | Buffer | null;
};

export type HttpAntwort = {
  status: number;
  rumpf: string;
  retryAfter: string | null;
};

export type HttpTransport = (anfrage: HttpAnfrage) => Promise<HttpAntwort>;

export const BUCHHALTUNG_HTTP = Symbol('BUCHHALTUNG_HTTP');

const ZEITLIMIT_MS = 30_000;

const MAX_ANTWORT = 2 * 1024 * 1024;

export const sichererBuchhaltungsTransport =
  (): HttpTransport =>
  async ({ methode, url, headers, rumpf = null }) => {
    const ziel = new URL(url);

    if (
      ziel.protocol !== 'https:' ||
      !(ERLAUBTE_RECHNER as readonly string[]).includes(ziel.hostname) ||
      ziel.port !== '' ||
      ziel.username !== ''
    ) {
      throw new Error('Diese Adresse gehört zu keinem Buchhaltungsprogramm.');
    }

    const antwort = await sichereAnfrage(
      ziel,
      methode,
      headers,
      rumpf,
      ZEITLIMIT_MS,
      MAX_ANTWORT,
    );

    return {
      status: antwort.status,
      rumpf: antwort.rumpf,
      retryAfter: antwort.retryAfter,
    };
  };

export class AnbieterFehler extends Error {
  constructor(
    message: string,
    readonly art: 'anmeldung' | 'voruebergehend' | 'sonstig',
    readonly status: number | null = null,
    readonly wiederAb: Date | null = null,
  ) {
    super(message);
    this.name = 'AnbieterFehler';
  }
}

export const retryAfterAls = (
  wert: string | null,
  jetzt: Date = new Date(),
): Date | null => {
  if (wert === null || wert.trim() === '') {
    return null;
  }

  const sekunden = Number(wert.trim());

  if (Number.isFinite(sekunden) && sekunden >= 0) {
    return new Date(jetzt.getTime() + Math.min(sekunden, 86_400) * 1000);
  }

  const datum = Date.parse(wert);

  return Number.isNaN(datum) ? null : new Date(datum);
};

export const kurzerGrund = (rumpf: string): string | null => {
  let text = '';

  try {
    const json = JSON.parse(rumpf) as Record<string, unknown>;
    const liste = (json.IssueList ?? json.issueList) as
      | { i18nKey?: string; source?: string }[]
      | undefined;

    if (Array.isArray(liste) && liste.length > 0) {
      text = liste
        .map((eintrag) =>
          [eintrag.source, eintrag.i18nKey].filter(Boolean).join(': '),
        )
        .join('; ');
    } else if (typeof json.message === 'string') {
      text = json.message;
    } else if (
      typeof json.error === 'object' &&
      json.error !== null &&
      typeof (json.error as { message?: unknown }).message === 'string'
    ) {
      text = (json.error as { message: string }).message;
    }
  } catch {
    return null;
  }

  // eslint-disable-next-line no-control-regex
  const sauber = text.replace(/[\u0000-\u001f]+/gu, ' ').trim();

  return sauber === '' ? null : sauber.slice(0, 200);
};

export const pruefeAntwort = (
  anbieterName: string,
  antwort: HttpAntwort,
  jetzt: Date = new Date(),
): void => {
  const { status } = antwort;

  if (status >= 200 && status < 300) {
    return;
  }

  if (status === 401) {
    throw new AnbieterFehler(
      `${anbieterName} hat den API-Schlüssel abgelehnt. Wurde er widerrufen oder neu erzeugt? Bitte neu verbinden.`,
      'anmeldung',
      status,
    );
  }

  if (status === 402) {
    throw new AnbieterFehler(
      `${anbieterName} lässt diese Aktion mit dem gebuchten Tarif nicht zu (Vertragsproblem beim Anbieter).`,
      'sonstig',
      status,
    );
  }

  if (status === 403) {
    throw new AnbieterFehler(
      `${anbieterName} verweigert diesen Schritt: dem API-Schlüssel fehlen Rechte. Stegwerk braucht Zugriff auf Kontakte, Belege, Dateien und Zahlungen. Bitte dort einen Schlüssel mit diesen Rechten erzeugen, ihn unter Einstellungen → Buchhaltung eingeben und die Rechnung erneut senden.`,
      'sonstig',
      status,
    );
  }

  if (status === 429) {
    throw new AnbieterFehler(
      `${anbieterName} ist gerade überlastet (zu viele Anfragen). Stegwerk versucht es später erneut.`,
      'voruebergehend',
      status,
      retryAfterAls(antwort.retryAfter, jetzt),
    );
  }

  if (status >= 500 || status === 0) {
    throw new AnbieterFehler(
      `${anbieterName} ist gerade nicht erreichbar (Status ${String(status)}). Stegwerk versucht es später erneut.`,
      'voruebergehend',
      status,
      retryAfterAls(antwort.retryAfter, jetzt),
    );
  }

  const grund = kurzerGrund(antwort.rumpf);

  throw new AnbieterFehler(
    `${anbieterName} hat den Beleg abgelehnt (Status ${String(status)})${grund === null ? '' : `: ${grund}`}.`,
    'sonstig',
    status,
  );
};

export const netzFehler = (anbieterName: string): AnbieterFehler =>
  new AnbieterFehler(
    `${anbieterName} ist gerade nicht erreichbar (keine Verbindung oder Zeitüberschreitung). Stegwerk versucht es später erneut.`,
    'voruebergehend',
  );

export class Taktgeber {
  private readonly naechste = new Map<string, number>();

  constructor(
    private readonly abstandMs = 600,
    private readonly schlafen: (ms: number) => Promise<void> = (ms) =>
      new Promise((fertig) => setTimeout(fertig, ms)),
    private readonly uhr: () => number = () => Date.now(),
  ) {}

  async warte(schluessel: string): Promise<void> {
    const jetzt = this.uhr();
    const frei = this.naechste.get(schluessel) ?? 0;
    const start = Math.max(jetzt, frei);

    this.naechste.set(schluessel, start + this.abstandMs);

    if (start > jetzt) {
      await this.schlafen(start - jetzt);
    }
  }
}

export const multipart = (
  datei: { feld: string; name: string; typ: string; inhalt: Buffer },
  felder: Record<string, string> = {},
): { rumpf: Buffer; typ: string } => {
  const grenze = `----stegwerk${randomBytes(12).toString('hex')}`;
  const name = datei.name.replace(/["\r\n\\]/gu, '_');
  const teile: Buffer[] = [];

  for (const [feld, wert] of Object.entries(felder)) {
    teile.push(
      Buffer.from(
        `--${grenze}\r\nContent-Disposition: form-data; name="${feld}"\r\n\r\n${wert}\r\n`,
        'utf8',
      ),
    );
  }

  teile.push(
    Buffer.from(
      `--${grenze}\r\nContent-Disposition: form-data; name="${datei.feld}"; filename="${name}"\r\nContent-Type: ${datei.typ}\r\n\r\n`,
      'utf8',
    ),
    datei.inhalt,
    Buffer.from(`\r\n--${grenze}--\r\n`, 'utf8'),
  );

  return {
    rumpf: Buffer.concat(teile),
    typ: `multipart/form-data; boundary=${grenze}`,
  };
};
