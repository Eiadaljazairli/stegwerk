import { describe, expect, it } from 'vitest';

import {
  ANGEBOTS_STATUS_FELD,
  angebotsSchritt,
  angebotsSchrittFrage,
  angebotsSchrittVerboten,
} from './angebotsBoard';
import { spaltenFuer } from './recordBoard';

const ALLES = { senden: true, aendern: true };

describe('angebotsSchritt', () => {
  it('kennt genau die Schritte nach vorn', () => {
    expect(angebotsSchritt('DRAFT', 'SENT', ALLES)).toBe('senden');
    expect(angebotsSchritt('SENT', 'ACCEPTED', ALLES)).toBe('annehmen');
    expect(angebotsSchritt('SENT', 'DECLINED', ALLES)).toBe('ablehnen');
  });

  it('lässt nichts zurück und nichts überspringen', () => {
    expect(angebotsSchritt('SENT', 'DRAFT', ALLES)).toBeNull();
    expect(angebotsSchritt('DRAFT', 'ACCEPTED', ALLES)).toBeNull();
    expect(angebotsSchritt('ACCEPTED', 'DECLINED', ALLES)).toBeNull();
    expect(angebotsSchritt('DECLINED', 'SENT', ALLES)).toBeNull();
  });

  it('braucht fürs Versenden das Recht zum Versenden, für die Antwort das zum Ändern', () => {
    expect(
      angebotsSchritt('DRAFT', 'SENT', { senden: false, aendern: true }),
    ).toBeNull();
    expect(
      angebotsSchritt('SENT', 'ACCEPTED', { senden: true, aendern: false }),
    ).toBeNull();
    expect(
      angebotsSchritt('SENT', 'DECLINED', { senden: false, aendern: true }),
    ).toBe('ablehnen');
  });
});

describe('angebotsSchrittVerboten', () => {
  it('sagt, was stattdessen geht', () => {
    expect(angebotsSchrittVerboten('SENT', 'DRAFT', ALLES)).toContain(
      'kopieren',
    );
    expect(
      angebotsSchrittVerboten('DRAFT', 'SENT', {
        senden: false,
        aendern: true,
      }),
    ).toContain('nicht versenden');
    expect(angebotsSchrittVerboten('ACCEPTED', 'DECLINED', ALLES)).toContain(
      'nicht mehr ändern',
    );
  });
});

describe('Spalten des Angebots-Boards', () => {
  it('stehen in der Reihenfolge der Schritte, ohne Spalte „ohne Status“', () => {
    expect(
      spaltenFuer(ANGEBOTS_STATUS_FELD, ['SENT']).map((spalte) => spalte.wert),
    ).toEqual(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED']);
  });
});

describe('angebotsSchrittFrage', () => {
  it('nennt die Nummer und die Folge', () => {
    const frage = angebotsSchrittFrage('senden', 'A-2026-0007');

    expect(frage.titel).toContain('A-2026-0007');
    expect(frage.folge).toContain('nichts mehr');
  });
});
