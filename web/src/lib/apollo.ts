import {
  ApolloClient,
  createHttpLink,
  from,
  fromPromise,
  InMemoryCache,
  type TypePolicies,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

import {
  clearSession,
  readLegacyRefreshToken,
  readToken,
  updateSessionToken,
} from './session';
import { aenderungsLink } from './aenderungen';
import { letzteEingabe, merkeAbmeldegrund } from './leerlauf';
import { TAB_KENNUNG } from './live';
import { behandlung } from './unauthorized';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/graphql';

const httpLink = createHttpLink({ uri: API_URL, credentials: 'include' });

const authLink = setContext((_operation, { headers }) => {
  const token = readToken();

  return {
    headers: {
      ...headers,
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      'x-stegwerk-tab': TAB_KENNUNG,
    },
  };
});

const REFRESH_MUTATION = `
  mutation Refresh($input: RefreshInput) {
    refresh(input: $input) {
      token
    }
  }
`;

const requestNewTokens = async (): Promise<string | null> => {
  const alt = readLegacyRefreshToken();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: REFRESH_MUTATION,
        variables: {
          input: {
            ...(alt === null ? {} : { refreshToken: alt }),
            letzteEingabe: letzteEingabe(),
          },
        },
      }),
    });

    const body = await response.json();
    const refreshed = body?.data?.refresh;

    if (refreshed === undefined || refreshed === null) {
      const meldung: unknown = body?.errors?.[0]?.message;

      if (typeof meldung === 'string' && meldung.includes('Inaktivität')) {
        merkeAbmeldegrund('leerlauf');
      }

      return null;
    }

    updateSessionToken(refreshed.token);

    return refreshed.token as string;
  } catch {
    return null;
  }
};

let inFlightRefresh: Promise<string | null> | null = null;

const refreshOnce = (): Promise<string | null> => {
  inFlightRefresh ??= requestNewTokens().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
};

const unauthorizedLink = onError(({ graphQLErrors, operation, forward }) => {
  const isUnauthenticated = graphQLErrors?.some(
    (error) => error.extensions?.code === 'UNAUTHENTICATED',
  );

  if (isUnauthenticated !== true) {
    return;
  }

  const was = behandlung(operation.operationName);

  if (was === 'melden') {
    return;
  }

  if (was === 'abmelden') {
    clearSession();
    window.location.assign('/anmelden');

    return;
  }

  return fromPromise(refreshOnce()).flatMap((token) => {
    if (token === null) {
      clearSession();
      window.location.assign('/anmelden');

      return forward(operation);
    }

    operation.setContext(({ headers = {} }: { headers?: object }) => ({
      headers: { ...headers, authorization: `Bearer ${token}` },
    }));

    return forward(operation);
  });
});

export const TYPE_RICHTLINIEN: TypePolicies = {
  QuoteTotals: { merge: true },
};

export const apolloClient = new ApolloClient({
  link: from([aenderungsLink, unauthorizedLink, authLink, httpLink]),
  cache: new InMemoryCache({ typePolicies: TYPE_RICHTLINIEN }),
});
