import {
  ApolloClient,
  ApolloLink,
  ApolloProvider,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import axe from 'axe-core';
import {
  buildSchema,
  getNullableType,
  graphql,
  type GraphQLFieldResolver,
  type GraphQLOutputType,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  print,
} from 'graphql';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider } from '../lib/auth';
import { StageSettingsProvider } from '../lib/stages';
import { ToastProvider } from './Toast';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const dialog = globalThis.HTMLDialogElement?.prototype;

if (dialog !== undefined && typeof dialog.showModal !== 'function') {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialog.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

if (globalThis.HTMLCanvasElement !== undefined) {
  globalThis.HTMLCanvasElement.prototype.getContext = () => null;
}

const SCHEMA = buildSchema(
  readFileSync(join(process.cwd(), '../server/schema.gql'), 'utf8'),
);

const leer = (typ: GraphQLOutputType): unknown => {
  if (!isNonNullType(typ)) {
    return null;
  }

  const innen = getNullableType(typ);

  if (isListType(innen)) {
    return [];
  }

  if (isEnumType(innen)) {
    return innen.getValues()[0]?.value ?? null;
  }

  if (isScalarType(innen)) {
    switch (innen.name) {
      case 'Int':
      case 'Float':
        return 0;
      case 'Boolean':
        return false;
      case 'ID':
        return 'id';
      default:
        return '';
    }
  }

  return isObjectType(innen) ? {} : null;
};

const feldwert: GraphQLFieldResolver<unknown, unknown> = (
  eltern,
  _args,
  _kontext,
  info,
) => {
  const wert = (eltern as Record<string, unknown> | null)?.[info.fieldName];

  return wert === undefined ? leer(info.returnType) : wert;
};

export const testClient = (daten: Record<string, unknown> = {}) =>
  new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((beobachter) => {
          void graphql({
            schema: SCHEMA,
            source: print(operation.query),
            variableValues: operation.variables,
            rootValue: daten,
            fieldResolver: feldwert,
          }).then((ergebnis) => {
            beobachter.next(ergebnis as never);
            beobachter.complete();
          });
        }),
    ),
  });

export type Gerendert = {
  container: HTMLElement;
  root: Root;
  abbauen: () => Promise<void>;
};

export const rendere = async (
  ui: ReactNode,
  {
    daten = {},
    pfad = '/',
  }: { daten?: Record<string, unknown>; pfad?: string } = {},
): Promise<Gerendert> => {
  const container = document.createElement('div');

  document.body.append(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ApolloProvider client={testClient(daten)}>
        <AuthProvider>
          <MemoryRouter initialEntries={[pfad]}>
            <ToastProvider>
              <StageSettingsProvider>{ui}</StageSettingsProvider>
            </ToastProvider>
          </MemoryRouter>
        </AuthProvider>
      </ApolloProvider>,
    );
  });
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });

  return {
    container,
    root,
    abbauen: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

export const axeVerstoesse = async (element: Element): Promise<string[]> => {
  const ergebnis = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false } },
  });

  return ergebnis.violations.map(
    (verstoss) =>
      `${verstoss.id}: ${verstoss.nodes
        .map((knoten) => knoten.target.join(' '))
        .join(', ')}`,
  );
};
