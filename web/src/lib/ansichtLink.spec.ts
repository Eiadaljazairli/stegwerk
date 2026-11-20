import { describe, expect, it } from 'vitest';

import {
  bereinigeStand,
  darstellungDesStands,
  gleicherStand,
  type ListenStand,
  standKodieren,
  standLesen,
} from './ansichtLink';

const stand: ListenStand = {
  search: 'Müller & Söhne',
  sortField: 'name',
  sortDirection: 'DESC',
  customFilters: [{ key: 'branche', operator: 'EQUALS', value: 'Bäckerei' }],
  columns: ['name', 'city'],
  filters: { industry: 'Handel', openOnly: true },
};

describe('ansichtLink', () => {
  it('kommt mit Umlauten unverändert zurück', () => {
    expect(standLesen(standKodieren(stand))).toEqual(stand);
  });

  it('ist in einer Adresse unbedenklich', () => {
    expect(standKodieren(stand)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('nimmt Unsinn nicht an', () => {
    expect(standLesen('%%%')).toBeNull();
    expect(standLesen(standKodieren([] as never))).toBeNull();
    expect(standLesen(null)).toBeNull();
  });

  it('wirft fremde Formen einzelner Teile weg', () => {
    const roh = btoa(
      JSON.stringify({
        search: { boese: 1 },
        customFilters: [{ key: 1 }, { key: 'a', operator: 'EQUALS' }],
        filters: { a: { tief: true }, b: 'ok' },
      }),
    ).replace(/=+$/, '');

    expect(standLesen(roh)).toEqual({
      search: null,
      sortField: null,
      sortDirection: 'ASC',
      customFilters: [{ key: 'a', operator: 'EQUALS' }],
      columns: [],
      filters: { b: 'ok' },
    });
  });

  it('sieht leere und fehlende Werte als gleich', () => {
    expect(
      gleicherStand(stand, {
        ...stand,
        search: 'Müller & Söhne ',
        filters: { openOnly: true, industry: 'Handel', stage: '' },
      }),
    ).toBe(true);
    expect(gleicherStand(stand, { ...stand, sortDirection: 'ASC' })).toBe(
      false,
    );
  });

  it('lässt weg, was die Rolle nicht sieht oder was es nicht mehr gibt', () => {
    const roh: ListenStand = {
      ...stand,
      sortField: 'amount',
      customFilters: [
        { key: 'std:amount', operator: 'GREATER_THAN', value: '1000' },
        { key: 'branche', operator: 'EQUALS', value: 'Bau' },
        { key: 'geloescht', operator: 'EQUALS', value: 'x' },
      ],
    };
    const { stand: neu, entfernt } = bereinigeStand(
      roh,
      (key) => key === 'branche',
      (feld) => feld !== 'amount',
    );

    expect(entfernt).toBe(3);
    expect(neu.customFilters.map((f) => f.key)).toEqual(['branche']);
    expect(neu.sortField).toBeNull();
    expect(neu.search).toBe(stand.search);
  });

  it('setzt statt einer unerlaubten Sortierung die Standardsortierung', () => {
    const { stand: neu } = bereinigeStand(
      { ...stand, sortField: 'amount', sortDirection: 'DESC' },
      () => true,
      (feld) => feld !== 'amount',
      { sortField: 'createdAt', sortDirection: 'DESC' },
    );

    expect(neu.sortField).toBe('createdAt');
    expect(neu.sortDirection).toBe('DESC');
  });

  it('trägt Gruppierung, ODER und Filtergruppen durch den Link', () => {
    const mitGruppen: ListenStand = {
      ...stand,
      customFilters: [
        { key: 'std:industry', operator: 'EQUALS', value: 'Bau' },
        { key: 'std:city', operator: 'EQUALS', value: 'Hamburg', gruppe: 1 },
        { key: 'std:city', operator: 'EQUALS', value: 'Bremen', gruppe: 1 },
      ],
      gruppierung: 'std:industry',
      filterVerknuepfung: 'ODER',
    };

    expect(standLesen(standKodieren(mitGruppen))).toEqual(mitGruppen);
  });

  it('verwirft eine unbrauchbare Gruppierung und eine fremde Gruppe', () => {
    const roh = standKodieren({
      ...stand,
      customFilters: [{ key: 'a', operator: 'EQUALS', value: 'x', gruppe: 9 }],
      gruppierung: 'std:name"; DROP',
      filterVerknuepfung: 'VIELLEICHT',
    } as ListenStand);
    const gelesen = standLesen(roh);

    expect(gelesen?.gruppierung).toBeUndefined();
    expect(gelesen?.filterVerknuepfung).toBeUndefined();
    expect(gelesen?.customFilters).toEqual([
      { key: 'a', operator: 'EQUALS', value: 'x' },
    ]);
  });

  it('hält UND und keine Angabe für denselben Stand', () => {
    expect(
      gleicherStand(
        { ...stand, filterVerknuepfung: null, gruppierung: null },
        stand,
      ),
    ).toBe(true);
    expect(gleicherStand({ ...stand, gruppierung: 'std:city' }, stand)).toBe(
      false,
    );
  });

  it('nimmt die Darstellung mit, Unbekanntes als keine Angabe', () => {
    const board = { ...stand, darstellung: 'board' };
    const liste = { ...stand, darstellung: 'liste' };

    expect(standLesen(standKodieren(board))).toEqual(board);
    expect(standLesen(standKodieren(liste))).toEqual(liste);
    expect(gleicherStand(liste, stand)).toBe(true);
    expect(
      standLesen(standKodieren({ ...stand, darstellung: 'zeitstrahl' })),
    ).toEqual(stand);
    expect(gleicherStand({ ...stand, darstellung: null }, stand)).toBe(true);
    expect(gleicherStand(board, stand)).toBe(false);
  });

  it('nimmt Kalender, Board- und Datumsfeld mit und prüft sie', () => {
    const kalender = {
      ...stand,
      darstellung: 'kalender',
      gruppenFeld: 'custom:status',
      datumFeld: 'std:closeDate',
    };

    expect(standLesen(standKodieren(kalender))).toEqual(kalender);
    expect(
      standLesen(
        standKodieren({
          ...stand,
          gruppenFeld: 'std:x; DROP',
          datumFeld: 42 as unknown as string,
        }),
      ),
    ).toEqual(stand);
    expect(gleicherStand({ ...kalender, gruppenFeld: null }, kalender)).toBe(
      false,
    );
    expect(gleicherStand({ ...stand, gruppenFeld: null }, stand)).toBe(true);
  });
});

describe('darstellungDesStands', () => {
  it('nennt nur eine ausdrücklich gespeicherte Darstellung', () => {
    expect(darstellungDesStands({ darstellung: 'board' })).toBe('board');
    expect(darstellungDesStands({ darstellung: 'liste' })).toBe('liste');
    expect(darstellungDesStands({ darstellung: 'kalender' })).toBe('kalender');
  });

  it('lässt Ansichten und Links von vor dem Board ohne Angabe', () => {
    expect(darstellungDesStands({})).toBeNull();
    expect(darstellungDesStands({ darstellung: null })).toBeNull();
    expect(darstellungDesStands({ darstellung: 'zeitstrahl' })).toBeNull();
  });
});
