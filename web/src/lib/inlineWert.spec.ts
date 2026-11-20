import { describe, expect, it } from 'vitest';

import {
  alsEingabe,
  blaettertAuswahl,
  pruefeEntwurf,
  wertAusEingabe,
} from './inlineWert';

describe('direkt bearbeiten', () => {
  it('liest Zahlen deutsch und leer als löschen', () => {
    expect(wertAusEingabe('number', '2.500,50')).toBe(2500.5);
    expect(wertAusEingabe('number', '  ')).toBeNull();
    expect(wertAusEingabe('number', 'zwölf')).toBeUndefined();
    expect(wertAusEingabe('text', ' Nord ')).toBe('Nord');
  });

  it('zeigt eine Kommazahl mit Komma, damit sie beim Speichern gleich bleibt', () => {
    expect(alsEingabe('number', 1.125)).toBe('1,125');
    expect(wertAusEingabe('number', alsEingabe('number', 1.125))).toBe(1.125);
    expect(alsEingabe('date', '2026-10-25T00:00:00.000Z')).toBe('2026-10-25');
    expect(alsEingabe('text', null)).toBe('');
  });

  it('speichert nichts, wenn sich nichts geändert hat', () => {
    expect(pruefeEntwurf('text', 'Nord ', 'Nord')).toEqual({
      art: 'unveraendert',
    });
    expect(pruefeEntwurf('number', '1.500', 1500)).toEqual({
      art: 'unveraendert',
    });
  });

  it('fragt bei einer unlesbaren Zahl nach, statt sie zu leeren', () => {
    expect(pruefeEntwurf('number', '1,5,0', 1500)).toEqual({ art: 'unlesbar' });
  });

  it('gibt den neuen Wert zum Speichern', () => {
    expect(pruefeEntwurf('number', '2000', 1500)).toEqual({
      art: 'speichern',
      wert: 2000,
    });
    expect(pruefeEntwurf('date', '', '2026-01-01')).toEqual({
      art: 'speichern',
      wert: null,
    });
    expect(pruefeEntwurf('select', 'user-2', 'user-1')).toEqual({
      art: 'speichern',
      wert: 'user-2',
    });
  });
});

describe('Auswahl per Tastatur', () => {
  const taste = (key: string, mehr: { altKey?: boolean } = {}) => ({
    key,
    altKey: mehr.altKey ?? false,
    ctrlKey: false,
    metaKey: false,
  });

  it('nimmt Blättern auf der zugeklappten Auswahl als Entwurf', () => {
    for (const key of [
      'ArrowDown',
      'ArrowUp',
      'Home',
      'End',
      'PageDown',
      'm',
    ]) {
      expect(blaettertAuswahl(taste(key))).toBe(true);
    }
  });

  it('lässt Aufklappen, Enter und Escape nicht als Blättern gelten', () => {
    expect(blaettertAuswahl(taste('ArrowDown', { altKey: true }))).toBe(false);
    expect(blaettertAuswahl(taste(' '))).toBe(false);
    expect(blaettertAuswahl(taste('Enter'))).toBe(false);
    expect(blaettertAuswahl(taste('Escape'))).toBe(false);
    expect(blaettertAuswahl(taste('Tab'))).toBe(false);
  });
});
