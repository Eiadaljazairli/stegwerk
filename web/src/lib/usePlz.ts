import { useApolloClient } from '@apollo/client';
import { useCallback } from 'react';

import { meintDeutschland, type PlzOrt, plzVollstaendig } from './plz';
import { PLZ_ORTE } from './queries';

export const usePlzOrte = () => {
  const client = useApolloClient();

  return useCallback(
    async (plz: string, land?: string | null): Promise<PlzOrt[]> => {
      if (!plzVollstaendig(plz) || !meintDeutschland(land)) {
        return [];
      }

      try {
        const { data } = await client.query<{ plzOrte: PlzOrt[] }>({
          query: PLZ_ORTE,
          variables: { plz: plz.trim(), land: land ?? null },
          fetchPolicy: 'cache-first',
        });

        return data?.plzOrte ?? [];
      } catch {
        return [];
      }
    },
    [client],
  );
};
