import { describe, expect, it } from 'vitest';

import {
  bezugAusPfad,
  bezugAusZiel,
  entwurfEinsetzen,
  MAX_NACHRICHTEN,
  modellName,
  ohneSignatur,
  verlaufFuerServer,
} from './ki';

const ID = '0b9e8c1a-4c7e-4f5a-9d55-2a1f3b6c7d8e';

describe('verlaufFuerServer', () => {
  it('lässt Fehlermeldungen und Leeres weg', () => {
    expect(
      verlaufFuerServer([
        { rolle: 'user', text: 'Frage' },
        { rolle: 'assistant', text: 'Schlüssel abgelehnt', fehler: true },
        { rolle: 'user', text: '  ' },
        { rolle: 'user', text: 'Noch mal' },
      ]),
    ).toEqual([
      { rolle: 'user', text: 'Frage' },
      { rolle: 'user', text: 'Noch mal' },
    ]);
  });

  it('kürzt vorn und beginnt immer mit einer Frage', () => {
    const lang = Array.from({ length: MAX_NACHRICHTEN + 5 }, (_, index) => ({
      rolle: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `n${String(index)}`,
    }));
    const ergebnis = verlaufFuerServer(lang);

    expect(ergebnis.length).toBeLessThanOrEqual(MAX_NACHRICHTEN);
    expect(ergebnis[0].rolle).toBe('user');
    expect(ergebnis[ergebnis.length - 1].text).toBe(
      `n${String(MAX_NACHRICHTEN + 4)}`,
    );
  });

  it('hält die Gesamtlänge ein', () => {
    const ergebnis = verlaufFuerServer([
      { rolle: 'user', text: 'a'.repeat(8000) },
      { rolle: 'assistant', text: 'b'.repeat(8000) },
      ...Array.from({ length: 7 }, () => [
        { rolle: 'user' as const, text: 'c'.repeat(8000) },
        { rolle: 'assistant' as const, text: 'd'.repeat(8000) },
      ]).flat(),
      { rolle: 'user', text: 'Letzte Frage' },
    ]);
    const summe = ergebnis.reduce((s, n) => s + n.text.length, 0);

    expect(summe).toBeLessThanOrEqual(60_000);
    expect(ergebnis[0].rolle).toBe('user');
    expect(ergebnis[ergebnis.length - 1].text).toBe('Letzte Frage');
  });
});

describe('Bezug', () => {
  it('liest die Akte aus der Adresse', () => {
    expect(bezugAusPfad(`/geschaefte/${ID}`)).toEqual({ art: 'deal', id: ID });
    expect(bezugAusPfad(`/angebote/${ID}`)).toEqual({ art: 'quote', id: ID });
    expect(bezugAusPfad('/firmen')).toBeNull();
    expect(bezugAusPfad('/firmen/neu')).toBeNull();
    expect(bezugAusPfad(`/rechnungen/${ID}`)).toBeNull();
  });

  it('nimmt beim Mailformular die genaueste Akte', () => {
    expect(bezugAusZiel({ companyId: 'c', dealId: 'd' })).toEqual({
      art: 'deal',
      id: 'd',
    });
    expect(bezugAusZiel({ contactId: 'k' })).toEqual({
      art: 'contact',
      id: 'k',
    });
    expect(bezugAusZiel({})).toBeNull();
  });
});

describe('Entwurf ins Mailfeld', () => {
  const signatur = '\n\n-- \nAnna Muster';

  it('ersetzt den Text über der Signatur und lässt sie stehen', () => {
    expect(entwurfEinsetzen(`Alt${signatur}`, ' Neu \n', signatur)).toBe(
      `Neu${signatur}`,
    );
    expect(entwurfEinsetzen('Alt', 'Neu', signatur)).toBe('Neu');
    expect(ohneSignatur(`Alt${signatur}`, signatur)).toBe('Alt');
    expect(ohneSignatur('Alt', '')).toBe('Alt');
  });
});

it('nennt bekannte Modelle beim Namen', () => {
  expect(modellName('anthropic', 'claude-sonnet-5-5')).toBe(
    'Claude Sonnet 5.5',
  );
  expect(modellName('openai', 'mein-modell')).toBe('mein-modell');
});
