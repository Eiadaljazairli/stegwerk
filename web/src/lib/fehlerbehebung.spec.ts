import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  abhilfeFuer,
  abhilfePfad,
  FEHLERFAELLE,
  type FehlerId,
  fehlerfallPasst,
} from './fehlerbehebung';

const WEB = process.cwd();
const SERVER = join(WEB, '../server/src');

const quellen = (ordner: string): string[] =>
  readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);

    return statSync(pfad).isDirectory()
      ? quellen(pfad)
      : /\.tsx?$/u.test(name) && !name.includes('.spec.')
        ? [pfad]
        : [];
  });

const IDS = new Set<string>(FEHLERFAELLE.map((fall) => fall.id));

const saetze = (datei: string, anfang: RegExp): string[] =>
  [...readFileSync(join(SERVER, datei), 'utf8').matchAll(/'([^'\n]{12,})'/gu)]
    .map((treffer) => treffer[1])
    .filter((satz) => anfang.test(satz));

describe('die Fälle', () => {
  it('haben eindeutige Kennungen, die in eine Adresse passen', () => {
    expect(IDS.size).toBe(FEHLERFAELLE.length);

    for (const id of IDS) {
      expect(id).toMatch(/^[a-z0-9-]+$/u);
    }
  });

  it('sagen zu jedem Fall Ursache und Abhilfe', () => {
    for (const fall of FEHLERFAELLE) {
      expect(fall.titel.length).toBeGreaterThan(10);
      expect(fall.ursachen.length).toBeGreaterThan(0);
      expect(fall.schritte.length).toBeGreaterThan(0);
    }
  });

  it('sind um die zwölf, wie geplant', () => {
    expect(FEHLERFAELLE.length).toBeGreaterThanOrEqual(12);
  });
});

describe('Links aus der App', () => {
  it('zeigt jeder auf einen Fall, den es gibt', () => {
    const verlinkt = quellen(join(WEB, 'src')).flatMap((datei) => {
      const text = readFileSync(datei, 'utf8');

      return [
        ...text.matchAll(/<AbhilfeLink\s+id="([^"]+)"/gu),
        ...text.matchAll(/abhilfePfad\('([^']+)'\)/gu),
        ...text.matchAll(/\/hilfe\/fehlerbehebung#([a-z0-9-]+)/gu),
      ].map((treffer) => treffer[1]);
    });

    expect(verlinkt.length).toBeGreaterThan(3);
    expect(verlinkt.filter((id) => !IDS.has(id))).toEqual([]);
  });

  it('baut die Adresse mit Sprungmarke', () => {
    expect(abhilfePfad('pdf-vorschau')).toBe(
      '/hilfe/fehlerbehebung#pdf-vorschau',
    );
  });
});

describe('abhilfeFuer erkennt die Meldungen des Servers', () => {
  const erwarte = (saetzeListe: string[], id: FehlerId) => {
    expect(saetzeListe.length).toBeGreaterThan(0);

    for (const satz of saetzeListe) {
      expect([satz, abhilfeFuer(satz)]).toEqual([satz, id]);
    }
  };

  it('Postfach: Anmeldung', () => {
    erwarte(
      saetze('mailboxes/imap-reader.ts', /^Anmeldung fehlgeschlagen/u),
      'postfach-anmeldung',
    );
  });

  it('Postfach: Server, Port, Zertifikat', () => {
    erwarte(
      saetze(
        'mailboxes/imap-reader.ts',
        /^(Server nicht gefunden|Keine Verbindung|Das Zertifikat|Der Server hat die Verbindung)/u,
      ),
      'postfach-server',
    );
  });

  it('Postfach: Ordner', () => {
    erwarte(
      saetze('mailboxes/imap-reader.ts', /^Der Ordner wurde nicht gefunden/u),
      'postfach-ordner',
    );
  });

  it('Senden', () => {
    erwarte(
      saetze(
        'mailboxes/smtp-sender.ts',
        /^(Der Mailserver (?!hat die Anmeldedaten)|Die Nachricht)/u,
      ),
      'mail-senden',
    );
    erwarte(
      saetze(
        'mailboxes/smtp-sender.ts',
        /^Der Mailserver hat die Anmeldedaten/u,
      ),
      'postfach-anmeldung',
    );
    expect(
      abhilfeFuer('Der Mailserver hat die Nachricht abgelehnt (550).'),
    ).toBe('mail-senden');
  });

  it('Anbieter (Google, Microsoft)', () => {
    erwarte(
      [
        ...saetze(
          'oauth/oauth.service.ts',
          /^(Der Anbieter|Der Anmeldevorgang|Dieser Anmeldevorgang)/u,
        ),
        ...saetze('kalender-sync/caldav-client.ts', /^Der Kalenderanbieter/u),
      ],
      'anbieter-verbindung',
    );
  });

  it('Kalender', () => {
    erwarte(
      [
        ...saetze(
          'kalender-sync/caldav-client.ts',
          /^Der Kalenderserver|^Die Kalender|^Zu viele Weiterleitungen/u,
        ),
        ...saetze(
          'kalender-sync/kalender-sync.service.ts',
          /^Der Kalenderserver war|^Diesen Kalender/u,
        ),
      ],
      'kalender-verbindung',
    );
    expect(
      abhilfeFuer('Der Kalender hat den Termin nicht angenommen (412).'),
    ).toBe('kalender-verbindung');
  });

  it('Anmeldung gesperrt', () => {
    erwarte(
      [
        ...saetze('auth/fehlversuche.ts', /^Zu viele Fehlversuche/u),
        ...saetze(
          'observability/graphql-error.reporter.ts',
          /^Zu viele Versuche/u,
        ),
      ],
      'anmeldung-gesperrt',
    );
  });

  it('Zwei-Faktor-Code', () => {
    erwarte(
      saetze(
        'auth/two-factor.service.ts',
        /^(Der Code stimmt nicht|Dieser Code wurde schon)/u,
      ),
      'zwei-faktor-code',
    );
  });

  it('Einladung', () => {
    erwarte(
      saetze(
        'workspaces/invitations.service.ts',
        /^Diese Einladung (ist|ging)/u,
      ),
      'einladung',
    );
  });

  it('E-Rechnung, mit der Liste dahinter', () => {
    expect(
      abhilfeFuer('Für die E-Rechnung fehlt noch: IBAN (Briefkopf).'),
    ).toBe('e-rechnung');
  });

  it('Excel-Datei im Import', () => {
    const xlsx = [
      ...readFileSync(join(WEB, 'src/lib/xlsx.ts'), 'utf8').matchAll(
        /new XlsxFehler\('([^']+)'\)/gu,
      ),
    ].map((treffer) => treffer[1]);

    erwarte(xlsx, 'import');
  });

  it('kennt nicht, was sie nicht kennt', () => {
    expect(abhilfeFuer('Speichern fehlgeschlagen.')).toBeNull();
    expect(abhilfeFuer('')).toBeNull();
    expect(abhilfeFuer(null)).toBeNull();
    expect(abhilfeFuer(undefined)).toBeNull();
  });

  it('übersieht Groß- und Kleinschreibung und doppelte Leerzeichen', () => {
    expect(abhilfeFuer('der code  stimmt nicht.')).toBe('zwei-faktor-code');
  });
});

describe('Suche auf der Seite', () => {
  const fall = FEHLERFAELLE.find((eintrag) => eintrag.id === 'kalender-abo');

  it('findet über Titel, Ursache und Schritte', () => {
    expect(fall).toBeDefined();

    if (fall !== undefined) {
      expect(fehlerfallPasst(fall, 'abo')).toBe(true);
      expect(fehlerfallPasst(fall, 'Outlook Stunden')).toBe(true);
      expect(fehlerfallPasst(fall, 'xrechnung')).toBe(false);
      expect(fehlerfallPasst(fall, '  ')).toBe(true);
    }
  });
});
