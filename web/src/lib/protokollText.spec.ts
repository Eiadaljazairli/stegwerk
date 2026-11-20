import { describe, expect, it } from 'vitest';

import { einzelheitenText, sicherheitsZusatz } from './protokollText';

describe('einzelheitenText', () => {
  it('schreibt kein „null“ und keine geschweiften Klammern', () => {
    const text = sicherheitsZusatz(
      JSON.stringify({ liste: 'DEAL', auswahl: null, schluessel: null }),
    );

    expect(text).toBe('Geschäfte');
    expect(text).not.toMatch(/null|[{}]/u);
  });

  it('nennt Schlüssel und Programm eines KI-Assistenten', () => {
    expect(
      sicherheitsZusatz(
        JSON.stringify({ schluessel: 'mcp', programm: 'claude-code' }),
      ),
    ).toBe('Schlüssel „mcp“ · über claude-code');
  });

  it('liest Änderungen als „Feld: vorher → nachher“', () => {
    const text = einzelheitenText(
      'aenderung',
      JSON.stringify({ name: ['Alt GmbH', 'Neu GmbH'] }),
    );

    expect(text).toContain('Alt GmbH → Neu GmbH');
    expect(text).not.toMatch(/[[\]{}"]/u);
  });

  it('nennt umbenannte Objekte mit vorher und nachher', () => {
    expect(
      sicherheitsZusatz(
        JSON.stringify({
          objekt: 'KONTAKT',
          vorher: 'Kontakt / Kontakte',
          nachher: 'Patient / Patienten',
        }),
      ),
    ).toBe('Kontakt / Kontakte → Patient / Patienten');
    expect(
      sicherheitsZusatz(
        JSON.stringify({ objekt: 'alle', vorher: null, nachher: 'Standard' }),
      ),
    ).toBe('alle Objekte → Standard');
  });

  it('bleibt leer bei Unlesbarem', () => {
    expect(einzelheitenText('sicherheit', 'kein json')).toBe('');
    expect(einzelheitenText('aenderung', null)).toBe('');
  });
});

describe('Einzelheiten zu Schlüsseln und Vorschlägen der KI', () => {
  it('nennt Werkzeug und Modus', () => {
    expect(
      sicherheitsZusatz(
        JSON.stringify({ werkzeug: 'update_deal', schluessel: 'Assistent' }),
      ),
    ).toBe('Schlüssel „Assistent“ · Werkzeug update_deal');
    expect(
      sicherheitsZusatz(
        JSON.stringify({ name: 'Assistent', modus: 'vorschlag' }),
      ),
    ).toBe('„Assistent“ · nur vorschlagen');
  });
});

describe('Anmelden mit Google und Microsoft', () => {
  it('nennt den Weg der Anmeldung und den Anbieter der Verknüpfung', () => {
    expect(sicherheitsZusatz(JSON.stringify({ weg: 'google' }))).toBe(
      'mit Google',
    );
    expect(
      sicherheitsZusatz(
        JSON.stringify({ anbieter: 'microsoft', neuesKonto: false }),
      ),
    ).toBe('Microsoft');
  });
});
