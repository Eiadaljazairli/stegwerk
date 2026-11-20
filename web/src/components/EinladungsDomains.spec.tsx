// @vitest-environment jsdom
import {
  ApolloClient,
  ApolloLink,
  ApolloProvider,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { GraphQLError } from 'graphql';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthProvider } from '../lib/auth';
import { EinladungsDomainsSection } from './KontoSection';
import { testClient } from './testumgebung';
import { ToastProvider } from './Toast';

const ALLES_ERLAUBT = {
  myPermissions: { everything: true, permissions: [], feldrechte: [] },
};

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const rendereMitFehler = async () => {
  const echt = testClient(ALLES_ERLAUBT).link;
  const link = new ApolloLink((operation, weiter) =>
    operation.operationName === 'EinladungsDomains'
      ? new Observable((beobachter) => {
          beobachter.next({
            data: null,
            errors: [new GraphQLError('Server nicht erreichbar')],
          } as never);
          beobachter.complete();
        })
      : (echt.request(operation, weiter) ?? Observable.of()),
  );
  const client = new ApolloClient({ cache: new InMemoryCache(), link });

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <ApolloProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <ToastProvider>
              <EinladungsDomainsSection />
            </ToastProvider>
          </MemoryRouter>
        </AuthProvider>
      </ApolloProvider>,
    );
  });

  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }

  return container;
};

describe('EinladungsDomainsSection', () => {
  it('zeigt einen Ladefehler statt stumm gesperrter Felder', async () => {
    const ansicht = await rendereMitFehler();
    const meldung = ansicht.querySelector('[role="alert"]');

    expect(meldung?.textContent).toContain(
      'Die erlaubten Domains ließen sich nicht laden',
    );
    expect(meldung?.textContent).toContain('Server nicht erreichbar');
    expect(
      [...ansicht.querySelectorAll('button')].some(
        (knopf) => knopf.textContent === 'Erneut laden',
      ),
    ).toBe(true);
  });
});
