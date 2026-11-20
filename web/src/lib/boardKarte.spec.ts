import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  kartenFeldBearbeitbar,
  kartenFeldEingabe,
  leseKarte,
  merkeKarte,
  STANDARD_KARTE,
  umschalten,
} from './boardKarte';

const speicher = () => {
  const werte = new Map<string, string>();

  return {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => void werte.set(key, wert),
    clear: () => werte.clear(),
  };
};

describe('Kartenfelder im Board', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: speicher() }));
  afterEach(() => vi.unstubAllGlobals());

  it('zeigt ohne eigene Wahl die gewohnte Karte', () => {
    expect(leseKarte()).toEqual(STANDARD_KARTE);
  });

  it('merkt sich die Wahl und liest Unsinn als gewohnte Karte', () => {
    merkeKarte({ felder: ['owner'], kompakt: true });
    expect(leseKarte()).toEqual({ felder: ['owner'], kompakt: true });

    window.localStorage.setItem('stegwerk.deals.karte', '{kaputt');
    expect(leseKarte()).toEqual(STANDARD_KARTE);
  });

  it('hält beim Umschalten die Reihenfolge der Auswahl', () => {
    const reihenfolge = ['company', 'amount', 'closeDate', 'owner'];
    const ohneFirma = umschalten(STANDARD_KARTE, 'company', reihenfolge);

    expect(ohneFirma.felder).toEqual(['amount', 'closeDate']);
    expect(umschalten(ohneFirma, 'company', reihenfolge).felder).toEqual([
      'company',
      'amount',
      'closeDate',
    ]);
  });
});

describe('Felder auf der Karte bearbeiten', () => {
  it('gibt den festen Feldern ihre Eingabe, der Firma keine', () => {
    expect(kartenFeldEingabe('amount')).toBe('number');
    expect(kartenFeldEingabe('closeDate')).toBe('date');
    expect(kartenFeldEingabe('owner')).toBe('select');
    expect(kartenFeldEingabe('lostReason')).toBe('text');
    expect(kartenFeldEingabe('company')).toBeNull();
  });

  it('bearbeitet eigene Felder je nach Typ, sperrige nur in der Akte', () => {
    expect(kartenFeldEingabe('custom:budget', 'CURRENCY')).toBe('number');
    expect(kartenFeldEingabe('custom:region', 'SELECT')).toBe('select');
    expect(kartenFeldEingabe('custom:start', 'DATE')).toBe('date');
    expect(kartenFeldEingabe('custom:mail', 'EMAIL')).toBe('email');
    expect(kartenFeldEingabe('custom:tags', 'MULTI_SELECT')).toBeNull();
    expect(kartenFeldEingabe('custom:sitz', 'ADDRESS')).toBeNull();
    expect(kartenFeldEingabe('custom:weg')).toBeNull();
  });

  it('lässt nur ändern, wer Geschäfte ändern darf und das Feld nicht bloß liest', () => {
    expect(kartenFeldBearbeitbar(true, 'alle', 'number')).toBe(true);
    expect(kartenFeldBearbeitbar(true, 'lesen', 'number')).toBe(false);
    expect(kartenFeldBearbeitbar(true, 'verborgen', 'number')).toBe(false);
    expect(kartenFeldBearbeitbar(false, 'alle', 'number')).toBe(false);
    expect(kartenFeldBearbeitbar(true, 'alle', null)).toBe(false);
  });
});

describe('die Kennzahl im Spaltenkopf', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: speicher() }));
  afterEach(() => vi.unstubAllGlobals());

  it('merkt sich die Wahl mit der Karte', () => {
    merkeKarte({
      ...STANDARD_KARTE,
      aggregat: { art: 'gewichtet', feld: 'amount' },
    });

    expect(leseKarte().aggregat).toEqual({ art: 'gewichtet', feld: 'amount' });
  });

  it('vergisst eine unbrauchbare Wahl', () => {
    window.localStorage.setItem(
      'stegwerk.deals.karte',
      JSON.stringify({
        felder: [],
        kompakt: false,
        aggregat: { art: 'median' },
      }),
    );

    expect(leseKarte().aggregat).toBeUndefined();
  });
});
