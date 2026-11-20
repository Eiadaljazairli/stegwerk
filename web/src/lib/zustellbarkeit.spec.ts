import { describe, expect, it } from 'vitest';

import {
  dmarcText,
  empfaengerAuswahl,
  geprueftText,
  serienmailWarnung,
  spfText,
} from './zustellbarkeit';

const AM = '2026-10-20T12:30:00Z';

describe('Zustellbarkeit', () => {
  it('warnt vor der Serienmail nur, wenn SPF oder DMARC fehlen', () => {
    expect(
      serienmailWarnung({
        domain: 'firma.de',
        spf: 'ok',
        dmarc: 'fehlt',
        ampel: 'problem',
        hinweise: [],
        geprueftAm: AM,
      }),
    ).toMatch(/firma\.de fehlt DMARC/u);
    expect(
      serienmailWarnung({
        domain: 'firma.de',
        spf: 'fehlt',
        dmarc: 'fehlt',
        ampel: 'problem',
        hinweise: [],
        geprueftAm: AM,
      }),
    ).toMatch(/SPF und DMARC/u);
    expect(
      serienmailWarnung({
        domain: 'firma.de',
        spf: 'ok',
        dmarc: 'none',
        ampel: 'hinweis',
        hinweise: [],
        geprueftAm: AM,
      }),
    ).toBeNull();
    expect(serienmailWarnung(null)).toBeNull();
  });

  it('sagt bei unbekanntem SPF nicht, dass etwas fehlt', () => {
    expect(
      serienmailWarnung({
        domain: 'firma.de',
        spf: 'unbekannt',
        dmarc: 'fehlt',
        ampel: 'problem',
        hinweise: [],
        geprueftAm: AM,
      }),
    ).toMatch(/fehlt DMARC\./u);
    expect(serienmailWarnung(undefined)).toBeNull();
  });

  it('nennt die Uhrzeit der Prüfung und warum Neues noch fehlen kann', () => {
    const text = geprueftText(AM);

    expect(text).toContain('14:30 Uhr');
    expect(text).toMatch(/einigen Minuten/u);
  });

  it('beschreibt die Stände in Worten', () => {
    expect(spfText('ohneServer')).toMatch(/nicht erkennbar/u);
    expect(spfText('etwas')).toBe('etwas');
    expect(dmarcText('quarantine')).toMatch(/Spam/u);
    expect(dmarcText('unbekannt')).toMatch(/keine Antwort/u);
  });
});

describe('empfaengerAuswahl', () => {
  it('macht aus dem Wert der Liste die Auswahl für den Server', () => {
    expect(empfaengerAuswahl('auswahl', ['a', 'b'])).toEqual({
      kontaktIds: ['a', 'b'],
    });
    expect(empfaengerAuswahl('alle', ['a'])).toEqual({});
    expect(empfaengerAuswahl('verteiler:v1', [])).toEqual({
      verteilerId: 'v1',
    });
    expect(empfaengerAuswahl('ansicht-7', [])).toEqual({
      ansichtId: 'ansicht-7',
    });
    expect(empfaengerAuswahl('verteiler:a:b', ['x'])).toEqual({
      verteilerId: 'a:b',
    });
  });
});
