import { describe, expect, it } from 'vitest';

import {
  filterAusStand,
  filterErsetzen,
  standAusFilter,
  standPruefen,
} from './filterFormular';

describe('Filterformular', () => {
  it('legt eine Bedingung an wie bisher', () => {
    expect(
      filterAusStand('std:city', 'TEXT', {
        operator: 'EQUALS',
        value: ' Hamburg ',
        mehrere: [],
      }),
    ).toEqual({ key: 'std:city', operator: 'EQUALS', value: 'Hamburg' });
    expect(
      filterAusStand(
        'budget',
        'CURRENCY',
        { operator: 'GREATER_THAN', value: '2.500,50', mehrere: [] },
        2,
      ),
    ).toEqual({
      gruppe: 2,
      key: 'budget',
      operator: 'GREATER_THAN',
      value: '2500.5',
    });
    expect(
      filterAusStand('tags', 'MULTI_SELECT', {
        operator: 'CONTAINS_ANY',
        value: '',
        mehrere: ['A;B', 'C'],
      }),
    ).toEqual({ key: 'tags', operator: 'CONTAINS_ANY', value: '["A;B","C"]' });
    expect(
      filterAusStand('std:city', 'TEXT', {
        operator: 'IS_EMPTY',
        value: 'egal',
        mehrere: [],
      }),
    ).toEqual({ key: 'std:city', operator: 'IS_EMPTY' });
  });

  it('nimmt nichts an, solange ein Wert fehlt oder keine Zahl ist', () => {
    expect(
      standPruefen('NUMBER', {
        operator: 'EQUALS',
        value: 'zwölf',
        mehrere: [],
      }).ok,
    ).toBe(false);
    expect(
      filterAusStand('std:city', 'TEXT', {
        operator: 'EQUALS',
        value: '  ',
        mehrere: [],
      }),
    ).toBeNull();
    expect(
      standPruefen('DATE', {
        operator: 'IN_LAST_DAYS',
        value: '7',
        mehrere: [],
      }).ok,
    ).toBe(true);
  });

  it('belegt das Formular zum Ändern mit der gesetzten Bedingung vor', () => {
    expect(
      standAusFilter(
        { key: 'budget', operator: 'GREATER_THAN', value: '1.125' },
        'NUMBER',
      ),
    ).toEqual({ operator: 'GREATER_THAN', value: '1,125', mehrere: [] });
    expect(
      standAusFilter(
        { key: 'tags', operator: 'CONTAINS_ANY', value: '["Nord","Süd"]' },
        'MULTI_SELECT',
      ),
    ).toEqual({
      operator: 'CONTAINS_ANY',
      value: '',
      mehrere: ['Nord', 'Süd'],
    });
    expect(
      standAusFilter(
        { key: 'std:createdAt', operator: 'IN_LAST_DAYS', value: '7' },
        'DATE',
      ),
    ).toEqual({ operator: 'IN_LAST_DAYS', value: '7', mehrere: [] });
  });

  it('kommt vorbelegt und unverändert übernommen als dieselbe Bedingung zurück', () => {
    const gesetzt = {
      key: 'budget',
      operator: 'LESS_THAN' as const,
      value: '0.5',
    };

    expect(
      filterAusStand('budget', 'CURRENCY', standAusFilter(gesetzt, 'CURRENCY')),
    ).toEqual(gesetzt);
  });

  it('ändert eine Bedingung an ihrer Stelle und in ihrer Gruppe', () => {
    const vorher = [
      { key: 'std:city', operator: 'EQUALS' as const, value: 'Hamburg' },
      {
        key: 'std:industry',
        operator: 'EQUALS' as const,
        value: 'Bau',
        gruppe: 1,
      },
    ];

    expect(
      filterErsetzen(vorher, 1, {
        key: 'std:industry',
        operator: 'CONTAINS',
        value: 'Hand',
      }),
    ).toEqual([
      vorher[0],
      { key: 'std:industry', operator: 'CONTAINS', value: 'Hand', gruppe: 1 },
    ]);
    expect(
      filterErsetzen(vorher, 0, {
        key: 'std:city',
        operator: 'EQUALS',
        value: 'Bremen',
        gruppe: 3,
      })[0],
    ).toEqual({ key: 'std:city', operator: 'EQUALS', value: 'Bremen' });
  });
});
