import {
  ApolloClient,
  ApolloLink,
  from,
  gql,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { describe, expect, it, vi } from 'vitest';

import { aenderungsLink, nachAenderung } from './aenderungen';

const client = (antwort: { data?: unknown; errors?: { message: string }[] }) =>
  new ApolloClient({
    cache: new InMemoryCache(),
    link: from([
      aenderungsLink,
      new ApolloLink(
        () =>
          new Observable((beobachter) => {
            beobachter.next(antwort as never);
            beobachter.complete();
          }),
      ),
    ]),
  });

const UMBENENNEN = gql`
  mutation Umbenennen {
    umbenennen
  }
`;

const LESEN = gql`
  query Lesen {
    lesen
  }
`;

describe('aenderungsLink', () => {
  it('meldet eine erfolgreiche Mutation', async () => {
    const gemeldet = vi.fn();
    const abmelden = nachAenderung(gemeldet);

    await client({ data: { umbenennen: true } }).mutate({
      mutation: UMBENENNEN,
    });

    expect(gemeldet).toHaveBeenCalledTimes(1);

    abmelden();
    await client({ data: { umbenennen: true } }).mutate({
      mutation: UMBENENNEN,
    });

    expect(gemeldet).toHaveBeenCalledTimes(1);
  });

  it('meldet weder Abfragen noch fehlgeschlagene Änderungen', async () => {
    const gemeldet = vi.fn();
    const abmelden = nachAenderung(gemeldet);

    await client({ data: { lesen: 1 } }).query({ query: LESEN });
    await client({ errors: [{ message: 'Nein' }] })
      .mutate({ mutation: UMBENENNEN })
      .catch(() => undefined);

    expect(gemeldet).not.toHaveBeenCalled();

    abmelden();
  });
});
