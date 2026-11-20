import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InMemoryCache } from '@apollo/client';
import { gql } from '@apollo/client';
import { buildSchema, type DocumentNode, print, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import {
  APP_START,
  fehlerhafteFelder,
  START_ABFRAGEN,
  vereinige,
} from './startdaten';

const wurzelfelder = (dokument: DocumentNode): string[] =>
  dokument.definitions.flatMap((definition) =>
    definition.kind === 'OperationDefinition'
      ? definition.selectionSet.selections.map((auswahl) =>
          auswahl.kind === 'Field' ? auswahl.name.value : '?',
        )
      : [],
  );

describe('Startabfrage', () => {
  it('passt zum Schema des Servers', () => {
    const schema = buildSchema(
      readFileSync(resolve(__dirname, '../../../server/schema.gql'), 'utf8'),
    );

    expect(validate(schema, APP_START)).toEqual([]);
  });

  it('enthält jede Startabfrage mit genau ihren Feldern', () => {
    const gedruckt = (dokument: DocumentNode): string[] =>
      dokument.definitions.flatMap((definition) =>
        definition.kind === 'OperationDefinition'
          ? definition.selectionSet.selections.map((auswahl) => print(auswahl))
          : [],
      );

    expect(gedruckt(APP_START)).toEqual(START_ABFRAGEN.flatMap(gedruckt));
    expect(wurzelfelder(APP_START)).toEqual(
      START_ABFRAGEN.flatMap(wurzelfelder),
    );
  });

  it('danach findet jede Startabfrage ihre Daten im Cache', () => {
    const cache = new InMemoryCache();
    const a = gql`
      query A {
        me {
          id
          email
        }
      }
    `;
    const b = gql`
      query B {
        zweiFaktorVerlangt
      }
    `;

    cache.writeQuery({
      query: vereinige('AB', [a, b]),
      data: {
        me: { __typename: 'User', id: 'u1', email: 'a@b.de' },
        zweiFaktorVerlangt: false,
      },
    });

    expect(cache.readQuery({ query: a })).toEqual({
      me: { __typename: 'User', id: 'u1', email: 'a@b.de' },
    });
    expect(cache.readQuery({ query: b })).toEqual({
      zweiFaktorVerlangt: false,
    });
  });

  it('nimmt keine Abfrage mit Variablen und keine Änderung', () => {
    expect(() =>
      vereinige('X', [
        gql`
          query Mit($id: ID!) {
            quote(id: $id) {
              id
            }
          }
        `,
      ]),
    ).toThrow(/Variablen/u);
    expect(() =>
      vereinige('X', [
        gql`
          mutation M {
            signOut
          }
        `,
      ]),
    ).toThrow(/Nur Abfragen/u);
  });

  it('nennt die Wurzelfelder, die einen Fehler hatten, je einmal', () => {
    expect(
      fehlerhafteFelder([
        { path: ['pipelines'] },
        { path: ['pipelines', 0, 'phasen'] },
        { path: ['myMailbox'] },
        {},
      ]),
    ).toEqual(['pipelines', 'myMailbox']);
    expect(fehlerhafteFelder(undefined)).toEqual([]);
  });
});

describe('Cache-Richtlinien', () => {
  it('eine Teilabfrage der Summen lässt die vollständigen stehen', async () => {
    const { TYPE_RICHTLINIEN } = await import('./apollo');
    const cache = new InMemoryCache({ typePolicies: TYPE_RICHTLINIEN });
    const liste = gql`
      query Liste {
        invoices {
          id
          totals {
            netCents
            grossCents
          }
        }
      }
    `;
    const teil = gql`
      query Teil {
        invoiceSeriesList {
          id
          sourceInvoice {
            id
            totals {
              grossCents
            }
          }
        }
      }
    `;

    cache.writeQuery({
      query: liste,
      data: {
        invoices: [
          {
            __typename: 'Invoice',
            id: 'r1',
            totals: {
              __typename: 'QuoteTotals',
              netCents: 100,
              grossCents: 119,
            },
          },
        ],
      },
    });
    cache.writeQuery({
      query: teil,
      data: {
        invoiceSeriesList: [
          {
            __typename: 'InvoiceSeries',
            id: 's1',
            sourceInvoice: {
              __typename: 'Invoice',
              id: 'r1',
              totals: { __typename: 'QuoteTotals', grossCents: 119 },
            },
          },
        ],
      },
    });

    expect(cache.readQuery({ query: liste })).not.toBeNull();
  });
});
