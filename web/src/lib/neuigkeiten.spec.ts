import { describe, expect, it } from 'vitest';

import {
  NEUIGKEITEN,
  type Neuigkeit,
  neuesteNeuigkeit,
  ungelesen,
} from './neuigkeiten';

const eintrag = (id: string, datum: string): Neuigkeit => ({
  id,
  datum,
  titel: id,
  punkte: [],
});

const liste = [
  eintrag('c', '2026-10-21'),
  eintrag('b', '2026-10-20'),
  eintrag('a', '2026-10-20'),
  eintrag('alt', '2026-09-01'),
];

describe('neuigkeiten', () => {
  it('zählt, was seit dem letzten Besuch dazukam', () => {
    expect(ungelesen(liste, '2026-10-20')).toBe(1);
    expect(ungelesen(liste, '2026-09-30')).toBe(3);
    expect(ungelesen(liste, '2026-10-21')).toBe(0);
  });

  it('zeigt beim ersten Mal nur das Neueste, nicht die ganze Geschichte', () => {
    expect(ungelesen(liste, null)).toBe(1);
  });

  it('findet den jüngsten Eintrag', () => {
    expect(neuesteNeuigkeit(liste)).toBe('2026-10-21');
    expect(neuesteNeuigkeit([])).toBe('');
  });

  it('hat eindeutige Kennungen, gültige Daten und neueste zuerst', () => {
    const ids = NEUIGKEITEN.map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const n of NEUIGKEITEN) {
      expect(n.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.punkte.length).toBeGreaterThan(0);
    }

    const daten = NEUIGKEITEN.map((n) => n.datum);

    expect([...daten].sort().reverse()).toEqual(daten);
  });
});
