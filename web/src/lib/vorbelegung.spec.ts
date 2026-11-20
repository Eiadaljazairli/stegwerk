import { describe, expect, it } from 'vitest';

import {
  eingabeAusGruppe,
  mitGruppe,
  mitVorbelegung,
  vorbelegungAusFiltern,
} from './vorbelegung';

const SPALTEN = ['name', 'industry', 'city', 'postalCode'] as const;

describe('vorbelegungAusFiltern', () => {
  it('übernimmt „ist“ und „enthält“ auf festen Feldern', () => {
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:industry', operator: 'EQUALS', value: 'Bau' },
          { key: 'std:city', operator: 'CONTAINS', value: ' Hamburg ' },
        ],
        'UND',
        SPALTEN,
      ),
    ).toEqual({ industry: 'Bau', city: 'Hamburg' });
  });

  it('übernimmt für die Zeile in der Tabelle nur „ist“', () => {
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:industry', operator: 'EQUALS', value: 'Bau' },
          { key: 'std:city', operator: 'CONTAINS', value: 'Ber' },
        ],
        'UND',
        SPALTEN,
        { nurIst: true },
      ),
    ).toEqual({ industry: 'Bau' });
  });

  it('lässt Vergleiche ohne einen Wert aus', () => {
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:city', operator: 'NOT_EQUALS', value: 'Kiel' },
          { key: 'std:createdAt', operator: 'IN_LAST_DAYS', value: '7' },
          { key: 'std:name', operator: 'IS_EMPTY' },
        ],
        'UND',
        SPALTEN,
      ),
    ).toEqual({});
  });

  it('übernimmt nichts unter ODER und nichts aus einer Gruppe', () => {
    const filter = [
      { key: 'std:city', operator: 'EQUALS' as const, value: 'Hamburg' },
      { key: 'std:city', operator: 'EQUALS' as const, value: 'Bremen' },
    ];

    expect(vorbelegungAusFiltern(filter, 'ODER', SPALTEN)).toEqual({});
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:industry', operator: 'EQUALS', value: 'Bau' },
          { ...filter[0], gruppe: 1 },
          { ...filter[1], gruppe: 1 },
        ],
        'UND',
        SPALTEN,
      ),
    ).toEqual({ industry: 'Bau' });
  });

  it('nimmt bei zwei verschiedenen Werten keinen', () => {
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:city', operator: 'EQUALS', value: 'Hamburg' },
          { key: 'std:city', operator: 'CONTAINS', value: 'Ham' },
        ],
        'UND',
        SPALTEN,
      ),
    ).toEqual({});
  });

  it('übernimmt keine Felder der Firma und keine eigenen Felder', () => {
    expect(
      vorbelegungAusFiltern(
        [
          { key: 'std:firma.city', operator: 'EQUALS', value: 'Hamburg' },
          { key: 'region', operator: 'EQUALS', value: 'Nord' },
        ],
        'UND',
        SPALTEN,
      ),
    ).toEqual({});
  });
});

describe('vorbelegungAusFiltern mit Feldrechten', () => {
  it('übernimmt kein Feld, das die Rolle nur lesen oder nicht sehen darf', () => {
    const filter = [
      { key: 'std:industry', operator: 'EQUALS' as const, value: 'Bau' },
      { key: 'std:city', operator: 'EQUALS' as const, value: 'Kiel' },
    ];
    const rechte: Record<string, string> = { city: 'lesen', industry: 'alle' };
    const frei = (spalte: string) => (rechte[spalte] ?? 'alle') === 'alle';

    expect(
      vorbelegungAusFiltern(filter, 'UND', SPALTEN, { nurIst: true, frei }),
    ).toEqual({ industry: 'Bau' });

    rechte.city = 'verborgen';
    expect(vorbelegungAusFiltern(filter, 'UND', SPALTEN, { frei })).toEqual({
      industry: 'Bau',
    });

    rechte.city = 'alle';
    expect(vorbelegungAusFiltern(filter, 'UND', SPALTEN, { frei })).toEqual({
      industry: 'Bau',
      city: 'Kiel',
    });
  });
});

describe('mitVorbelegung', () => {
  it('füllt nur leere Felder', () => {
    const form = { name: '', industry: 'Handel', city: '' };

    expect(
      mitVorbelegung(form, { industry: 'Bau', city: 'Hamburg', extra: 'x' }),
    ).toEqual({ name: '', industry: 'Handel', city: 'Hamburg' });
  });

  it('gibt dasselbe Objekt zurück, wenn nichts zu tun ist', () => {
    const form = { name: 'A' };

    expect(mitVorbelegung(form, { name: 'B' })).toBe(form);
  });
});

describe('eingabeAusGruppe', () => {
  it('legt in der Phase der Gruppe an, als Enum wie die Oberfläche', () => {
    expect(eingabeAusGruppe('std:stage', { wert: 'proposal' })).toEqual({
      stage: 'PROPOSAL',
    });
  });

  it('übernimmt feste und eigene Felder', () => {
    expect(eingabeAusGruppe('std:industry', { wert: 'Bau' })).toEqual({
      industry: 'Bau',
    });
    expect(eingabeAusGruppe('std:ownerId', { wert: 'u-1' })).toEqual({
      ownerId: 'u-1',
    });
    expect(eingabeAusGruppe('custom:region', { wert: 'Nord' })).toEqual({
      customFields: { region: 'Nord' },
    });
  });

  it('gibt ohne Wert und bei einem nicht sichtbaren nichts vor', () => {
    expect(eingabeAusGruppe('std:companyId', { wert: null })).toEqual({});
    expect(
      eingabeAusGruppe('std:companyId', { wert: 'c-1', nichtSichtbar: true }),
    ).toEqual({});
  });

  it('gibt kein Feld vor, das die Rolle nur lesen darf', () => {
    const nurRegionGesperrt = (spalte: string) => spalte !== 'custom:region';

    expect(
      eingabeAusGruppe('custom:region', { wert: 'Nord' }, nurRegionGesperrt),
    ).toEqual({});
    expect(
      eingabeAusGruppe(
        'std:industry',
        { wert: 'Bau' },
        (spalte) => spalte !== 'industry',
      ),
    ).toEqual({});
    expect(
      eingabeAusGruppe('std:industry', { wert: 'Bau' }, nurRegionGesperrt),
    ).toEqual({ industry: 'Bau' });
    expect(
      mitGruppe(
        { name: 'Neu', customFields: { quelle: 'Messe' } },
        'custom:region',
        { wert: 'Nord' },
        nurRegionGesperrt,
      ),
    ).toEqual({ name: 'Neu', customFields: { quelle: 'Messe' } });
  });

  it('führt Vorbelegung aus Filtern und Gruppe zusammen', () => {
    expect(
      mitGruppe(
        { name: 'Neu', city: 'Hamburg', customFields: { quelle: 'Messe' } },
        'custom:region',
        { wert: 'Nord' },
      ),
    ).toEqual({
      name: 'Neu',
      city: 'Hamburg',
      customFields: { quelle: 'Messe', region: 'Nord' },
    });
    expect(mitGruppe({ name: 'Neu' }, undefined, undefined)).toEqual({
      name: 'Neu',
    });
  });
});
