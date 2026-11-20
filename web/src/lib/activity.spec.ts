import { describe, expect, it } from 'vitest';

import {
  type AuditEntry,
  buildFeed,
  describeChanges,
  describeValue,
  filterFeed,
  herkunftText,
} from './activity';

describe('reading a stored value', () => {
  it('says leer for nothing at all', () => {
    expect(describeValue(null)).toBe('leer');
    expect(describeValue(undefined)).toBe('leer');
    expect(describeValue('')).toBe('leer');
  });

  it('reads a deal stage in German', () => {
    expect(describeValue('proposal')).toBe('Angebot');
    expect(describeValue('WON')).toBe('Gewonnen');
  });

  it('reads a yes or no', () => {
    expect(describeValue(true)).toBe('Ja');
    expect(describeValue(false)).toBe('Nein');
  });

  it('groups a number the German way', () => {
    expect(describeValue(48_500)).toBe('48.500');
  });

  it('turns a date around', () => {
    expect(describeValue('2026-11-30')).toBe('30.11.2026');
    expect(describeValue('2026-11-30T09:15:00.000Z')).toBe('30.11.2026');
  });

  it('leaves ordinary text alone', () => {
    expect(describeValue('Nordwind Logistik GmbH')).toBe(
      'Nordwind Logistik GmbH',
    );
  });

  it('does not mistake text for a date', () => {
    expect(describeValue('2026 war ein gutes Jahr')).toBe(
      '2026 war ein gutes Jahr',
    );
  });

  it('says only that a structure changed', () => {
    expect(describeValue({ a: 1 })).toBe('geändert');
    expect(describeValue(['a'])).toBe('geändert');
  });
});

describe('reading the changes in an entry', () => {
  it('labels a field in German', () => {
    expect(describeChanges({ amount: [1000, 2500] })).toEqual([
      { label: 'Betrag', from: '1.000', to: '2.500' },
    ]);
  });

  it('falls back to the key for a field it does not know', () => {
    expect(describeChanges({ irgendwas: ['a', 'b'] })).toEqual([
      { label: 'irgendwas', from: 'a', to: 'b' },
    ]);
  });

  it('leaves out the fields that are not news', () => {
    expect(
      describeChanges({
        updatedAt: ['2026-01-01', '2026-01-02'],
        name: ['Alt', 'Neu'],
      }),
    ).toEqual([{ label: 'Bezeichnung', from: 'Alt', to: 'Neu' }]);
  });

  it('leaves out a pair that did not actually change', () => {
    expect(describeChanges({ name: ['Gleich', 'Gleich'] })).toEqual([]);
  });

  it('leaves out a pair that only looks different', () => {
    expect(describeChanges({ city: [null, ''] })).toEqual([]);
  });

  it('handles no changes at all', () => {
    expect(describeChanges(null)).toEqual([]);
    expect(describeChanges({})).toEqual([]);
  });
});

describe('the feed', () => {
  const note = (id: string, at: string) => ({
    id,
    body: `Notiz ${id}`,
    authorName: 'Anna Schmidt',
    createdAt: at,
  });

  const entry = (
    id: string,
    at: string,
    over: Partial<AuditEntry> = {},
  ): AuditEntry => ({
    id,
    action: 'updated',
    actorName: 'Jonas Weber',
    createdAt: at,
    changes: JSON.stringify({ stage: ['lead', 'proposal'] }),
    ...over,
  });

  it('puts notes and changes in one list, newest first', () => {
    const feed = buildFeed(
      [note('n1', '2026-09-01T10:00:00Z'), note('n2', '2026-09-03T10:00:00Z')],
      [entry('a1', '2026-09-02T10:00:00Z')],
    );

    expect(feed.map((item) => item.id)).toEqual([
      'note-n2',
      'audit-a1',
      'note-n1',
    ]);
  });

  it('keys the two kinds apart', () => {
    const feed = buildFeed(
      [note('same', '2026-09-01T10:00:00Z')],
      [entry('same', '2026-09-02T10:00:00Z')],
    );

    expect(new Set(feed.map((item) => item.id)).size).toBe(2);
  });

  it('drops an update whose changes all read the same', () => {
    const feed = buildFeed(
      [],
      [
        entry('a1', '2026-09-02T10:00:00Z', {
          changes: JSON.stringify({ updatedAt: ['x', 'y'] }),
        }),
      ],
    );

    expect(feed).toEqual([]);
  });

  it('keeps a creation even though it lists no changes', () => {
    const feed = buildFeed(
      [],
      [
        entry('a1', '2026-09-02T10:00:00Z', {
          action: 'created',
          changes: null,
        }),
      ],
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ kind: 'change', created: true });
  });

  it('survives a changes blob that will not parse', () => {
    const feed = buildFeed(
      [],
      [
        entry('a1', '2026-09-02T10:00:00Z', {
          action: 'created',
          changes: '{not json',
        }),
      ],
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ changes: [] });
  });

  it('carries who did it', () => {
    const feed = buildFeed(
      [note('n1', '2026-09-01T10:00:00Z')],
      [entry('a1', '2026-09-02T10:00:00Z')],
    );

    expect(feed.map((item) => item.author)).toEqual([
      'Jonas Weber',
      'Anna Schmidt',
    ]);
  });

  it('is empty when nothing has happened', () => {
    expect(buildFeed([], [])).toEqual([]);
  });
});

describe('Dateien im Verlauf', () => {
  const anhang = {
    id: 'a1',
    name: 'Vertrag.pdf',
    sizeBytes: 12345,
    createdAt: '2026-09-05T10:00:00.000Z',
    uploaderName: 'Anna Schmidt',
  };

  it('nimmt eine hochgeladene Datei auf', () => {
    const feed = buildFeed([], [], [anhang]);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: 'attachment',
      author: 'Anna Schmidt',
      name: 'Vertrag.pdf',
      attachmentId: 'a1',
    });
  });

  it('bleibt ohne Dateien unverändert', () => {
    expect(buildFeed([], [])).toEqual([]);
  });

  it('sortiert Dateien zwischen Notizen und Änderungen ein', () => {
    const feed = buildFeed(
      [
        {
          id: 'n1',
          body: 'davor',
          createdAt: '2026-09-04T10:00:00.000Z',
          authorName: 'Max',
        },
        {
          id: 'n2',
          body: 'danach',
          createdAt: '2026-09-06T10:00:00.000Z',
          authorName: 'Max',
        },
      ],
      [],
      [anhang],
    );

    expect(feed.map((eintrag) => eintrag.id)).toEqual([
      'note-n2',
      'attachment-a1',
      'note-n1',
    ]);
  });

  it('vergibt Kennungen, die sich nicht mit Notizen überschneiden', () => {
    const feed = buildFeed(
      [{ id: '1', body: 'x', createdAt: anhang.createdAt, authorName: 'Max' }],
      [],
      [{ ...anhang, id: '1' }],
    );

    expect(new Set(feed.map((eintrag) => eintrag.id)).size).toBe(2);
  });
});

describe('filterFeed', () => {
  const feed = [
    { kind: 'note', id: 'n' },
    { kind: 'change', id: 'c' },
    { kind: 'attachment', id: 'a' },
  ] as never[];

  it('zeigt alles oder nur eine Art', () => {
    expect(filterFeed(feed, 'alle')).toHaveLength(3);
    expect(
      filterFeed(feed, 'attachment').map((item: { id: string }) => item.id),
    ).toEqual(['a']);
  });
});

describe('Herkunft einer Änderung', () => {
  it('sagt, wenn Werte aus dem Impressum oder von der Website kamen', () => {
    const feed = buildFeed(
      [],
      [
        {
          id: 'a',
          action: 'updated',
          actorName: 'Anna',
          createdAt: '2026-10-01T10:00:00Z',
          changes: JSON.stringify({ ustIdNr: [null, 'DE123456789'] }),
          herkunft: 'impressum',
        },
        {
          id: 'b',
          action: 'updated',
          actorName: 'Anna',
          createdAt: '2026-10-01T09:00:00Z',
          changes: JSON.stringify({ logo: [null, 'firma.de'] }),
          herkunft: 'website',
        },
        {
          id: 'c',
          action: 'updated',
          actorName: 'Anna',
          createdAt: '2026-10-01T08:00:00Z',
          changes: JSON.stringify({ city: ['Kiel', 'Hamburg'] }),
          herkunft: null,
        },
      ],
    );

    expect(feed[0]).toMatchObject({
      herkunft: 'Aus dem Impressum der Website übernommen',
      changes: [{ label: 'USt-IdNr.', from: 'leer', to: 'DE123456789' }],
    });
    expect(feed[1]).toMatchObject({
      herkunft: 'Von der Website der Firma geholt',
      changes: [{ label: 'Logo', from: 'leer', to: 'firma.de' }],
    });
    expect(feed[2]).not.toHaveProperty('herkunft');
    expect(herkunftText('unbekannt')).toBeUndefined();
  });
});
