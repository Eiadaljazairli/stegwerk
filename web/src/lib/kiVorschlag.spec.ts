import { describe, expect, it } from 'vitest';

import {
  geaenderteFelder,
  leseStand,
  vorschlagZeilen,
  wertText,
} from './kiVorschlag';

describe('Vorschläge der KI als Zeilen', () => {
  it('zeigt bei einer Änderung vorher und nachher je Feld', () => {
    expect(
      vorschlagZeilen(
        { stage: 'LEAD', amount: 1000 },
        { stage: 'WON', amount: 1000 },
        { phase: (s) => (s === 'WON' ? 'Gewonnen' : 'Interessent') },
      ),
    ).toEqual([
      {
        feld: 'stage',
        label: 'Phase',
        vorher: 'Interessent',
        nachher: 'Gewonnen',
        geaendert: true,
      },
      {
        feld: 'amount',
        label: 'Betrag',
        vorher: '1.000',
        nachher: '1.000',
        geaendert: false,
      },
    ]);
  });

  it('zeigt bei etwas Neuem kein Vorher und Listen als Text', () => {
    const [an, betreff] = vorschlagZeilen(null, {
      an: ['a@kunde.de', 'b@kunde.de'],
      betreff: 'Ihr Angebot',
    });

    expect(an).toMatchObject({
      label: 'An',
      vorher: null,
      nachher: 'a@kunde.de, b@kunde.de',
      geaendert: true,
    });
    expect(betreff.nachher).toBe('Ihr Angebot');
  });

  it('zählt die Positionen eines Angebots durch', () => {
    const zeilen = vorschlagZeilen(
      { 'position:a': 'alt', 'position:b': null },
      { 'position:a': 'neu', 'position:b': 'auch neu' },
    );

    expect(zeilen.map((z) => [z.label, z.vorher, z.nachher])).toEqual([
      ['Beschreibung, 1. geänderte Position', 'alt', 'neu'],
      ['Beschreibung, 2. geänderte Position', '—', 'auch neu'],
    ]);
  });

  it('schreibt Daten deutsch und nennt Kennungen beim Namen, wenn bekannt', () => {
    expect(wertText('closeDate', '2026-11-30')).toBe('30.11.2026');
    expect(
      wertText('companyId', 'f1', {
        name: (_feld, id) => (id === 'f1' ? 'Nordwind GmbH' : null),
      }),
    ).toBe('Nordwind GmbH');
    expect(wertText('companyId', 'f2', { name: () => null })).toBe('f2');
    expect(wertText('text', '')).toBe('—');
  });

  it('liest nur Objekte als Stand', () => {
    expect(leseStand('{"a":1}')).toEqual({ a: 1 });
    expect(leseStand('[1]')).toBeNull();
    expect(leseStand('kaputt')).toBeNull();
    expect(leseStand(null)).toBeNull();
  });

  it('nennt die Felder, die sich seit dem Vorschlag geändert haben', () => {
    expect(
      geaenderteFelder(
        { stage: 'LEAD', amount: 1 },
        { stage: 'NEGOTIATION', amount: 1 },
      ),
    ).toEqual(['stage']);
    expect(geaenderteFelder(null, { stage: 'WON' })).toEqual([]);
  });
});
