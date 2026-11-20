import { describe, expect, it } from 'vitest';

import {
  ersteGruppe,
  gruppenFuer,
  hatBetrag,
  hatEigeneFelder,
  hatVerantwortlichen,
} from './kachelObjekte';

describe('kachelObjekte', () => {
  it('bietet für Rechnungen Branche, Herkunft, Kunde und Zeit an', () => {
    expect(gruppenFuer('invoice').map((g) => g.wert)).toEqual([
      'branche',
      'herkunft',
      'kunde',
      'woche',
      'monat',
      'quartal',
      'jahr',
    ]);
  });

  it('bietet Kunde nur für Rechnungen und Verantwortlich nicht für sie', () => {
    expect(gruppenFuer('deal').map((g) => g.wert)).not.toContain('kunde');
    expect(gruppenFuer('invoice').map((g) => g.wert)).not.toContain(
      'verantwortlich',
    );
    expect(gruppenFuer('task').map((g) => g.wert)).toContain('verantwortlich');
  });

  it('beginnt beim Wechsel mit der ersten passenden Gruppe', () => {
    expect(ersteGruppe('deal')).toBe('phase');
    expect(ersteGruppe('company')).toBe('verantwortlich');
    expect(ersteGruppe('invoice')).toBe('branche');
  });

  it('kennt Beträge nur an Geschäften und Rechnungen', () => {
    expect(hatBetrag('deal')).toBe(true);
    expect(hatBetrag('invoice')).toBe(true);
    expect(hatBetrag('company')).toBe(false);
    expect(hatBetrag(null)).toBe(false);
  });

  it('kennt an Rechnungen weder eigene Felder noch Verantwortliche', () => {
    expect(hatEigeneFelder('invoice')).toBe(false);
    expect(hatVerantwortlichen('invoice')).toBe(false);
    expect(hatEigeneFelder('deal')).toBe(true);
  });
});
