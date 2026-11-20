import {
  abstandNach,
  fehlerArtVon,
  fehlerZeigen,
  mailFaellig,
  nachErfolg,
  nachFehler,
  wiederFaellig,
} from './abruf-fehler';
import { reasonFor } from './imap-reader';

const MIN = 60_000;
const JETZT = new Date('2026-10-20T08:00:00Z');

describe('fehlerArtVon', () => {
  it.each([
    [
      reasonFor(new Error('Invalid credentials (AUTHENTICATIONFAILED)')),
      'anmeldung',
    ],
    [
      reasonFor(new Error('connect ECONNREFUSED 1.2.3.4:993')),
      'voruebergehend',
    ],
    [reasonFor(new Error('Socket timeout')), 'voruebergehend'],
    [
      reasonFor(new Error('getaddrinfo ENOTFOUND imap.tippfehler.de')),
      'sonstig',
    ],
    ['Der Kalenderserver war nicht erreichbar.', 'voruebergehend'],
    [
      'Der Kalenderserver hat die Anmeldung abgelehnt. Bitte Benutzer und App-Passwort prüfen.',
      'anmeldung',
    ],
    [
      'Microsoft hat den Zugriff auf den Kalender abgelehnt. Bitte neu verbinden.',
      'anmeldung',
    ],
    [
      'Der Zugriff wurde beim Anbieter widerrufen oder ist abgelaufen. Bitte neu verbinden.',
      'anmeldung',
    ],
    ['Der Anbieter war nicht erreichbar.', 'voruebergehend'],
    ['Die Kalender ließen sich nicht abrufen.', 'sonstig'],
  ])('%s → %s', (satz, art) => {
    expect(fehlerArtVon(satz)).toBe(art);
  });
});

describe('Wiederholung', () => {
  it('wartet nach vorübergehenden Fehlern 10, 20, 40 Minuten, höchstens 6 Stunden', () => {
    const art = 'voruebergehend' as const;

    expect(abstandNach({ fehlerArt: art, fehlversuche: 1 })).toBe(10 * MIN);
    expect(abstandNach({ fehlerArt: art, fehlversuche: 2 })).toBe(20 * MIN);
    expect(abstandNach({ fehlerArt: art, fehlversuche: 3 })).toBe(40 * MIN);
    expect(abstandNach({ fehlerArt: art, fehlversuche: 30 })).toBe(360 * MIN);
  });

  it('versucht nach Anmeldefehlern stündlich', () => {
    expect(abstandNach({ fehlerArt: 'anmeldung', fehlversuche: 5 })).toBe(
      60 * MIN,
    );
    expect(abstandNach({ fehlerArt: null, fehlversuche: 0 })).toBe(60 * MIN);
  });

  it('ist fällig, wenn der Abstand um ist, mit einer Minute Spielraum', () => {
    const stand = { fehlerArt: 'voruebergehend' as const, fehlversuche: 1 };

    expect(
      wiederFaellig(stand, new Date(JETZT.getTime() - 9 * MIN), JETZT),
    ).toBe(true);
    expect(
      wiederFaellig(stand, new Date(JETZT.getTime() - 5 * MIN), JETZT),
    ).toBe(false);
    expect(wiederFaellig(stand, null, JETZT)).toBe(true);
  });
});

describe('Banner und Mail', () => {
  it('zeigt einen Netzaussetzer erst ab dem dritten Fehlversuch', () => {
    const fehler = 'Keine Verbindung zum Server.';

    expect(
      fehlerZeigen({ fehler, fehlerArt: 'voruebergehend', fehlversuche: 2 }),
    ).toBe(false);
    expect(
      fehlerZeigen({ fehler, fehlerArt: 'voruebergehend', fehlversuche: 3 }),
    ).toBe(true);
    expect(
      fehlerZeigen({ fehler, fehlerArt: 'anmeldung', fehlversuche: 1 }),
    ).toBe(true);
    expect(fehlerZeigen({ fehler, fehlerArt: null, fehlversuche: 0 })).toBe(
      true,
    );
    expect(
      fehlerZeigen({ fehler: null, fehlerArt: 'anmeldung', fehlversuche: 9 }),
    ).toBe(false);
  });

  it('zählt Fehlversuche und behält den Beginn der Störung', () => {
    const erster = nachFehler(
      { fehlversuche: 0, fehlerSeit: null },
      'Socket timeout',
      JETZT,
    );
    const zweiter = nachFehler(
      erster,
      'Anmeldung fehlgeschlagen.',
      new Date(JETZT.getTime() + 10 * MIN),
    );

    expect(erster).toEqual({
      fehlerArt: 'sonstig',
      fehlversuche: 1,
      fehlerSeit: JETZT,
    });
    expect(zweiter).toEqual({
      fehlerArt: 'anmeldung',
      fehlversuche: 2,
      fehlerSeit: JETZT,
    });
  });

  it('meldet einen Tag Stillstand einmal, und der Erfolg setzt alles zurück', () => {
    const gestoert = {
      fehlerArt: 'anmeldung' as const,
      fehlversuche: 4,
      fehlerSeit: new Date(JETZT.getTime() - 25 * 60 * MIN),
      fehlerMailAm: null,
    };

    expect(mailFaellig(gestoert, JETZT)).toBe(true);
    expect(mailFaellig({ ...gestoert, fehlerMailAm: JETZT }, JETZT)).toBe(
      false,
    );
    expect(
      mailFaellig(
        { ...gestoert, fehlerSeit: new Date(JETZT.getTime() - MIN) },
        JETZT,
      ),
    ).toBe(false);
    expect(mailFaellig(nachErfolg(), JETZT)).toBe(false);
  });
});
