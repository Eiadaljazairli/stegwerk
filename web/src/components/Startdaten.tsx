import { useApolloClient } from '@apollo/client';
import { type ReactNode, useEffect, useState } from 'react';

import { APP_START, fehlerhafteFelder } from '../lib/startdaten';

export const Startdaten = ({ children }: { children: ReactNode }) => {
  const client = useApolloClient();
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    let aktiv = true;

    client
      .query({
        query: APP_START,
        errorPolicy: 'all',
        fetchPolicy: 'network-only',
      })
      .then((antwort) => {
        for (const feld of fehlerhafteFelder(antwort.errors)) {
          client.cache.evict({ id: 'ROOT_QUERY', fieldName: feld });
        }
      })
      .catch(() => null)
      .finally(() => {
        if (aktiv) {
          setBereit(true);
        }
      });

    return () => {
      aktiv = false;
    };
  }, [client]);

  if (!bereit) {
    return (
      <div className="state" aria-busy="true">
        Wird geladen…
      </div>
    );
  }

  return <>{children}</>;
};
