import { describe, expect, it } from 'vitest';

import { pickColumns, toggleColumn } from './columns';

const COLUMNS = [
  { key: 'name' },
  { key: 'domain' },
  { key: 'industry' },
  { key: 'city' },
  { key: 'custom:kundennummer' },
];

const keys = (columns: { key: string }[]) => columns.map((c) => c.key);

describe('picking the columns to show', () => {
  it('shows everything when nothing was chosen', () => {
    expect(keys(pickColumns(COLUMNS, []))).toEqual(keys(COLUMNS));
  });

  it('shows only what was chosen', () => {
    expect(keys(pickColumns(COLUMNS, ['name', 'city']))).toEqual([
      'name',
      'city',
    ]);
  });

  it('keeps the definitions order, not the order they were chosen', () => {
    expect(keys(pickColumns(COLUMNS, ['city', 'domain', 'name']))).toEqual([
      'name',
      'domain',
      'city',
    ]);
  });

  it('drops a column that no longer exists', () => {
    expect(keys(pickColumns(COLUMNS, ['name', 'custom:weg', 'city']))).toEqual([
      'name',
      'city',
    ]);
  });

  it('keeps the first column even when the choice leaves it out', () => {
    expect(keys(pickColumns(COLUMNS, ['city', 'domain']))).toEqual([
      'name',
      'domain',
      'city',
    ]);
  });

  it('never returns an empty table', () => {
    expect(keys(pickColumns(COLUMNS, ['custom:weg']))).toEqual(['name']);
  });

  it('answers an empty definition list without reaching for a first entry', () => {
    expect(pickColumns([], ['name'])).toEqual([]);
    expect(pickColumns([], [])).toEqual([]);
  });
});

describe('ticking a column', () => {
  it('turns one off, starting from the defaults', () => {
    expect(toggleColumn(COLUMNS, [], 'domain')).toEqual([
      'name',
      'industry',
      'city',
      'custom:kundennummer',
    ]);
  });

  it('turns one back on', () => {
    expect(toggleColumn(COLUMNS, ['name', 'city'], 'domain')).toEqual([
      'name',
      'domain',
      'city',
    ]);
  });

  it('puts a re-ticked column back where it belongs, not at the end', () => {
    const without = toggleColumn(COLUMNS, [], 'domain');

    expect(toggleColumn(COLUMNS, without, 'domain')).toEqual(keys(COLUMNS));
  });

  it('keeps the first column when something else is unticked', () => {
    expect(toggleColumn(COLUMNS, ['name', 'city'], 'city')).toEqual(['name']);
  });

  it('puts the first column back if a stored choice omitted it', () => {
    expect(toggleColumn(COLUMNS, ['city'], 'domain')).toEqual([
      'name',
      'domain',
      'city',
    ]);
  });

  it('handles a custom field like any other column', () => {
    expect(toggleColumn(COLUMNS, ['name'], 'custom:kundennummer')).toEqual([
      'name',
      'custom:kundennummer',
    ]);
  });

  it('ignores a key that is not a column', () => {
    expect(toggleColumn(COLUMNS, ['name', 'city'], 'erfunden')).toEqual([
      'name',
      'city',
    ]);
  });
});
