import {
  formatInvoiceNumber,
  missingNumbers,
  parseInvoiceNumber,
} from './invoice-numbers';

describe('eine Nummer bilden', () => {
  it('setzt Jahr und laufende Zahl zusammen', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('RE-2026-0001');
  });

  it('füllt die laufende Zahl auf vier Stellen auf', () => {
    expect(formatInvoiceNumber(2026, 42)).toBe('RE-2026-0042');
    expect(formatInvoiceNumber(2026, 9999)).toBe('RE-2026-9999');
  });

  it('wächst über zehntausend hinaus, statt vorne abzuschneiden', () => {
    expect(formatInvoiceNumber(2026, 10_000)).toBe('RE-2026-10000');
  });

  it('lehnt eine laufende Zahl unter eins ab', () => {
    expect(() => formatInvoiceNumber(2026, 0)).toThrow(/laufende Zahl/u);
    expect(() => formatInvoiceNumber(2026, -3)).toThrow(/laufende Zahl/u);
  });

  it('lehnt ein unmögliches Jahr ab', () => {
    expect(() => formatInvoiceNumber(26, 1)).toThrow(/Jahr/u);
    expect(() => formatInvoiceNumber(2026.5, 1)).toThrow(/Jahr/u);
  });
});

describe('eine Nummer lesen', () => {
  it('holt Jahr und laufende Zahl wieder heraus', () => {
    expect(parseInvoiceNumber('RE-2026-0042')).toEqual({
      year: 2026,
      sequence: 42,
    });
  });

  it('liest auch die fünfstellige Form', () => {
    expect(parseInvoiceNumber('RE-2026-10000')?.sequence).toBe(10_000);
  });

  it('stört sich nicht an Leerzeichen ringsum', () => {
    expect(parseInvoiceNumber('  RE-2026-0007 ')?.sequence).toBe(7);
  });

  it('erkennt, was keine Rechnungsnummer ist', () => {
    expect(parseInvoiceNumber('AN-2026-0001')).toBeNull();
    expect(parseInvoiceNumber('RE-26-0001')).toBeNull();
    expect(parseInvoiceNumber('RE-2026-1')).toBeNull();
    expect(parseInvoiceNumber('')).toBeNull();
    expect(parseInvoiceNumber('Rechnung 5')).toBeNull();
  });

  it('lehnt die Null ab, auch wenn sie richtig aussieht', () => {
    expect(parseInvoiceNumber('RE-2026-0000')).toBeNull();
  });

  it('kommt mit dem zurück, was hineinging', () => {
    for (const sequence of [1, 9, 10, 99, 100, 1234, 99_999]) {
      const number = formatInvoiceNumber(2026, sequence);

      expect(parseInvoiceNumber(number)?.sequence).toBe(sequence);
    }
  });
});

describe('Lücken finden', () => {
  it('meldet nichts bei einer geschlossenen Reihe', () => {
    expect(
      missingNumbers(['RE-2026-0001', 'RE-2026-0002', 'RE-2026-0003']),
    ).toEqual([]);
  });

  it('findet die fehlende Nummer in der Mitte', () => {
    expect(missingNumbers(['RE-2026-0001', 'RE-2026-0003'])).toEqual([
      'RE-2026-0002',
    ]);
  });

  it('stört sich nicht an der Reihenfolge der Eingabe', () => {
    expect(missingNumbers(['RE-2026-0003', 'RE-2026-0001'])).toEqual([
      'RE-2026-0002',
    ]);
  });

  it('zählt jedes Jahr für sich', () => {
    expect(
      missingNumbers(['RE-2025-0001', 'RE-2026-0001', 'RE-2026-0002']),
    ).toEqual([]);
  });

  it('findet Lücken in mehreren Jahren, das ältere zuerst', () => {
    expect(
      missingNumbers(['RE-2025-0002', 'RE-2026-0001', 'RE-2026-0003']),
    ).toEqual(['RE-2025-0001', 'RE-2026-0002']);
  });

  it('bemerkt eine Reihe, die nicht bei eins beginnt', () => {
    expect(missingNumbers(['RE-2026-0002'])).toEqual(['RE-2026-0001']);
  });

  it('übergeht, was keine Rechnungsnummer ist', () => {
    expect(missingNumbers(['AN-2026-0001', 'RE-2026-0001'])).toEqual([]);
  });

  it('kommt mit gar nichts zurecht', () => {
    expect(missingNumbers([])).toEqual([]);
  });
});
