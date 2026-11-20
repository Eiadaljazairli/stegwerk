import { describe, expect, it } from 'vitest';

import {
  ANLEITUNG,
  anbieterName,
  buchhaltungHinweis,
  standText,
} from './buchhaltung';
import { type BuchhaltungUebertragung } from './types';

const uebertragung = (
  anders: Partial<BuchhaltungUebertragung> = {},
): BuchhaltungUebertragung => ({
  id: 'u1',
  invoiceId: 'i1',
  anbieter: 'lexware',
  status: 'wartet',
  externeBelegId: null,
  zuPruefen: false,
  versuche: 0,
  letzterFehler: null,
  fehlerArt: null,
  uebertragenAm: null,
  bezahltGemeldet: false,
  updatedAt: '2026-10-27T10:00:00Z',
  ...anders,
});

describe('Buchhaltung', () => {
  it('nennt die Anbieter so, wie sie heißen', () => {
    expect(anbieterName('lexware')).toBe('Lexware Office');
    expect(anbieterName('sevdesk')).toBe('sevDesk');
    expect(ANLEITUNG.lexware.link?.href).toBe(
      'https://app.lexware.de/addons/public-api',
    );
    expect(ANLEITUNG.lexware.schritte.join(' ')).toMatch(
      /Kontakte, Belege, Dateien und Zahlungen/u,
    );
  });

  it('beschreibt den Stand einer Rechnung', () => {
    expect(standText(null)).toBeNull();
    expect(standText(uebertragung())?.ton).toBe('laeuft');

    const fertig = standText(
      uebertragung({
        status: 'uebertragen',
        uebertragenAm: '2026-10-27T10:00:00Z',
        zuPruefen: true,
      }),
    );

    expect(fertig?.text).toContain('An Lexware Office übertragen am');
    expect(fertig?.text).toContain('Zu prüfen');
    expect(fertig?.wiederholbar).toBe(false);

    const fehler = standText(
      uebertragung({ status: 'fehler', letzterFehler: 'Abgelehnt.' }),
    );

    expect(fehler).toMatchObject({ ton: 'fehler', wiederholbar: true });
    expect(fehler?.text).toContain('Abgelehnt.');

    expect(standText(uebertragung({ fehlerArt: 'anmeldung' }))?.text).toContain(
      'lehnt den API-Schlüssel ab',
    );
  });

  it('meldet im Banner nur einen abgelehnten Schlüssel, nicht auf der Seite selbst', () => {
    const kaputt = {
      anbieter: 'sevdesk',
      anmeldungFehler: 'sevDesk hat den API-Schlüssel abgelehnt.',
      fehlerZeigen: true,
    };

    expect(buchhaltungHinweis(kaputt, '/rechnungen')).toMatchObject({
      link: '/buchhaltung',
      linkText: 'Buchhaltung neu verbinden',
    });
    expect(buchhaltungHinweis(kaputt, '/buchhaltung')).toBeNull();
    expect(
      buchhaltungHinweis(
        { ...kaputt, anmeldungFehler: null, fehlerZeigen: false },
        '/rechnungen',
      ),
    ).toBeNull();
    expect(buchhaltungHinweis(null, '/')).toBeNull();
  });
});
