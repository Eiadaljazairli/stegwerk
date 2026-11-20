import { describe, expect, it } from 'vitest';

import {
  standardwertEingabeText,
  standardwertMoeglich,
  standardwertSenden,
} from './standardwert';

describe('standardwertMoeglich', () => {
  it('gibt es nicht für eindeutige Felder, Anschriften und Links', () => {
    expect(standardwertMoeglich({ type: 'TEXT', eindeutig: false })).toBe(true);
    expect(standardwertMoeglich({ type: 'TEXT', eindeutig: true })).toBe(false);
    expect(standardwertMoeglich({ type: 'ADDRESS', eindeutig: false })).toBe(
      false,
    );
    expect(standardwertMoeglich({ type: 'LINKS', eindeutig: false })).toBe(
      false,
    );
  });
});

describe('standardwertSenden', () => {
  it('liest Zahlen deutsch und schickt sie mit Punkt', () => {
    expect(standardwertSenden('NUMBER', '1.500')).toBe('1500');
    expect(standardwertSenden('CURRENCY', '2.500,50 €')).toBe('2500.5');
    expect(standardwertSenden('NUMBER', '12,5 %')).toBe('12.5');
  });

  it('meldet, was keine Zahl ist', () => {
    expect(standardwertSenden('NUMBER', 'viele')).toBeUndefined();
  });

  it('schickt Leeres als leer, das nimmt den Standardwert zurück', () => {
    expect(standardwertSenden('NUMBER', '  ')).toBe('');
    expect(standardwertSenden('SELECT', '')).toBe('');
  });

  it('lässt Texte und Auswahlen, wie sie sind', () => {
    expect(standardwertSenden('SELECT', ' Interessent ')).toBe('Interessent');
    expect(standardwertSenden('MULTI_SELECT', 'A;B')).toBe('A;B');
  });
});

describe('standardwertEingabeText', () => {
  it('zeigt Zahlen mit Komma und alles andere unverändert', () => {
    expect(
      standardwertEingabeText({ type: 'NUMBER', standardwert: '12.5' }),
    ).toBe('12,5');
    expect(
      standardwertEingabeText({ type: 'MULTI_SELECT', standardwert: 'A;B' }),
    ).toBe('A;B');
    expect(standardwertEingabeText({ type: 'TEXT', standardwert: null })).toBe(
      '',
    );
  });

  it('ergibt beim Zurückschicken denselben Wert', () => {
    expect(
      standardwertSenden(
        'CURRENCY',
        standardwertEingabeText({ type: 'CURRENCY', standardwert: '2500.5' }),
      ),
    ).toBe('2500.5');
  });
});
