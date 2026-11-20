import { describe, expect, it } from 'vitest';

import { beispielCsv, csvText } from './zeichensatz';

describe('Zeichensatz einer CSV-Datei', () => {
  it('liest UTF-8 als UTF-8', () => {
    const bytes = new TextEncoder().encode('Name\nMüller');

    expect(csvText(bytes.buffer)).toBe('Name\nMüller');
  });

  it('liest Windows-1252 aus Excel ohne Ersatzzeichen', () => {
    const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);

    expect(csvText(bytes.buffer)).toBe('Müller');
  });
});

describe('Beispieldatei', () => {
  it('hat Kopfzeile und Beispielzeile, mit Semikolon und BOM', () => {
    const csv = beispielCsv([
      { name: 'firstName', label: 'Vorname' },
      { name: 'lastName', label: 'Nachname' },
      { name: 'custom:x', label: 'Notiz; intern' },
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Vorname;Nachname;"Notiz; intern"');
    expect(csv).toContain('Erika;Mustermann;');
  });
});
