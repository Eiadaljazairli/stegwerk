import { describe, expect, it } from 'vitest';

import {
  freieArten,
  loesbar,
  verknuepfungen,
  zielMitVorschlaegen,
} from './verknuepfungen';

const notiz = {
  companyId: 'f1',
  contactId: null,
  dealId: 'g1',
  company: { id: 'f1', name: 'Muster GmbH' },
  contact: null,
  deal: null,
};

describe('verknuepfungen', () => {
  it('zeigt die übrigen Akten, ohne die, in der man ist', () => {
    expect(verknuepfungen(notiz, { companyId: 'f1' })).toEqual([
      {
        spalte: 'dealId',
        art: 'geschaeft',
        id: 'g1',
        label: null,
        to: null,
      },
    ]);
  });

  it('verlinkt sichtbare Akten', () => {
    expect(verknuepfungen(notiz, { dealId: 'g1' })).toEqual([
      {
        spalte: 'companyId',
        art: 'firma',
        id: 'f1',
        label: 'Muster GmbH',
        to: '/firmen/f1',
      },
    ]);
  });

  it('liest die Kennung auch aus dem Objekt (Aufgaben)', () => {
    expect(
      verknuepfungen({
        contact: { id: 'k1', firstName: 'Eva', lastName: 'Schulz' },
      }),
    ).toEqual([
      {
        spalte: 'contactId',
        art: 'kontakt',
        id: 'k1',
        label: 'Eva Schulz',
        to: '/kontakte/k1',
      },
    ]);
  });
});

describe('freieArten', () => {
  it('nur Arten ohne Verknüpfung, auch keine unsichtbare', () => {
    expect(freieArten(notiz).map((art) => art.spalte)).toEqual(['contactId']);
  });
});

describe('loesbar', () => {
  it('eine unsichtbare Verknüpfung nicht', () => {
    const [geschaeft] = verknuepfungen(notiz, { companyId: 'f1' });

    expect(loesbar(notiz, geschaeft, true)).toBe(false);
  });

  it('bei einer Notiz nicht die letzte', () => {
    const einzeln = {
      companyId: 'f1',
      company: { id: 'f1', name: 'Muster GmbH' },
    };
    const [firma] = verknuepfungen(einzeln);

    expect(loesbar(einzeln, firma, true)).toBe(false);
    expect(loesbar(einzeln, firma, false)).toBe(true);
    expect(loesbar(notiz, verknuepfungen(notiz)[0], true)).toBe(true);
  });
});

describe('zielMitVorschlaegen', () => {
  it('nimmt die gewählten Vorschläge zur Akte dazu', () => {
    expect(
      zielMitVorschlaegen(
        { dealId: 'g1' },
        [
          { spalte: 'companyId', id: 'f1', label: 'Muster GmbH' },
          { spalte: 'contactId', id: 'k1', label: 'Eva Schulz' },
        ],
        new Set(['f1']),
      ),
    ).toEqual({ dealId: 'g1', companyId: 'f1' });
  });

  it('überschreibt die Akte nicht, in der man ist', () => {
    expect(
      zielMitVorschlaegen(
        { companyId: 'f1' },
        [{ spalte: 'companyId', id: 'f2', label: 'Andere' }],
        new Set(['f2']),
      ),
    ).toEqual({ companyId: 'f1' });
  });
});
