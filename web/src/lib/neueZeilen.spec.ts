import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import {
  aktuelleAngeheftete,
  anheften,
  mitAngehefteten,
  zeilenFragment,
} from './neueZeilen';
import { ausDemZwischenspeicher } from './usePapierkorb';

type Zeile = { id: string; name: string };

const id = (zeile: Zeile) => zeile.id;
const a = { id: 'a', name: 'Alpha' };
const b = { id: 'b', name: 'Beta' };
const neu = { id: 'n', name: 'Neu GmbH' };

describe('neu angelegte Zeilen', () => {
  it('stehen oben, solange die Liste sie nicht zeigt', () => {
    expect(mitAngehefteten([neu], [a, b], id)).toEqual({
      zeilen: [neu, a, b],
      oben: new Set(['n']),
      ausserhalb: 1,
    });
  });

  it('stehen an ihrem Platz, sobald die Liste sie zeigt', () => {
    expect(mitAngehefteten([neu], [a, neu, b], id)).toEqual({
      zeilen: [a, neu, b],
      oben: new Set(),
      ausserhalb: 0,
    });
  });

  it('kommen vorn dazu, dieselbe nur einmal', () => {
    expect(anheften([a], neu, id)).toEqual([neu, a]);
    expect(anheften([neu, a], { ...neu, name: 'Neu AG' }, id)).toEqual([
      { id: 'n', name: 'Neu AG' },
      a,
    ]);
  });
});

describe('angeheftete Zeilen aus dem Zwischenspeicher', () => {
  const ANLAGE = gql`
    mutation Anlage($name: String!) {
      createCompany(name: $name) {
        id
        name
        owner {
          id
          firstName
        }
      }
    }
  `;
  const fragment = zeilenFragment(ANLAGE, 'Company');
  const firma = {
    __typename: 'Company',
    id: 'c1',
    name: 'Neu GmbH',
    owner: { __typename: 'User', id: 'u1', firstName: 'Ada' },
  };
  const speicher = () => {
    const cache = new InMemoryCache();

    cache.writeFragment({ fragment, data: firma });

    return cache;
  };

  it('liest genau, was die Anlage zurückgab', () => {
    expect(speicher().readFragment({ fragment, id: 'Company:c1' })).toEqual(
      firma,
    );
  });

  it('zeigt den Wert nach dem Bearbeiten, nicht die Kopie von der Anlage', () => {
    const cache = speicher();

    cache.writeFragment({
      fragment: gql`
        fragment Umbenannt on Company {
          id
          name
        }
      `,
      data: { __typename: 'Company', id: 'c1', name: 'Neu & Söhne GmbH' },
    });

    const stand = cache.readFragment<typeof firma>({
      fragment,
      id: 'Company:c1',
    });

    expect(stand?.name).toBe('Neu & Söhne GmbH');
    expect(
      aktuelleAngeheftete([firma], new Map([[firma, stand]]))[0]?.name,
    ).toBe('Neu & Söhne GmbH');
  });

  it('lässt eine gelöschte Zeile fallen', () => {
    const cache = speicher();

    ausDemZwischenspeicher(cache, 'FIRMA', ['c1']);

    expect(cache.readFragment({ fragment, id: 'Company:c1' })).toBeNull();
    expect(aktuelleAngeheftete([firma, neu], new Map([[firma, null]]))).toEqual(
      [neu],
    );
  });

  it('meldet der beobachtenden Tabelle Änderung und Löschen', async () => {
    const warten = () => new Promise((fertig) => setTimeout(fertig, 0));
    const cache = speicher();
    const client = new ApolloClient({ cache, link: ApolloLink.empty() });
    const staende: { name?: string; complete: boolean }[] = [];
    const abo = client
      .watchFragment({ fragment, from: 'Company:c1' })
      .subscribe({
        next: ({ data, complete }) =>
          staende.push({ name: (data as { name?: string }).name, complete }),
      });

    await warten();
    cache.modify({
      id: 'Company:c1',
      fields: { name: () => 'Umbenannt GmbH' },
    });
    await warten();
    ausDemZwischenspeicher(cache, 'FIRMA', ['c1']);
    await warten();
    abo.unsubscribe();

    expect(staende.at(0)).toEqual({ name: 'Neu GmbH', complete: true });
    expect(staende).toContainEqual({ name: 'Umbenannt GmbH', complete: true });
    expect(staende.at(-1)?.complete).toBe(false);
  });

  it('behält, was noch nicht gelesen ist', () => {
    expect(aktuelleAngeheftete([neu], new Map())).toEqual([neu]);
  });

  it('verlangt eine Anlage, die einen Datensatz zurückgibt', () => {
    expect(() =>
      zeilenFragment(
        gql`
          mutation Loeschen {
            deleteCompany(id: "c1")
          }
        `,
        'Company',
      ),
    ).toThrow();
  });
});
