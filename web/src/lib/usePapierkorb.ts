import {
  type ApolloCache,
  gql,
  type DocumentNode,
  useApolloClient,
  useMutation,
} from '@apollo/client';

import { useToast } from '../components/Toast';

export type PapierkorbArt = 'FIRMA' | 'KONTAKT' | 'GESCHAEFT' | 'AUFGABE';

export const WIEDERHERSTELLEN = gql`
  mutation Wiederherstellen($art: PapierkorbArt!, $id: ID!) {
    wiederherstellen(art: $art, id: $id)
  }
`;

const TYPNAME: Record<PapierkorbArt, string> = {
  FIRMA: 'Company',
  KONTAKT: 'Contact',
  GESCHAEFT: 'Deal',
  AUFGABE: 'Task',
};

export const ausDemZwischenspeicher = (
  cache: ApolloCache<unknown>,
  art: PapierkorbArt,
  ids: readonly string[],
): void => {
  for (const id of ids) {
    const schluessel = cache.identify({ __typename: TYPNAME[art], id });

    if (schluessel !== undefined) {
      cache.evict({ id: schluessel });
    }
  }

  cache.gc();
};

const NAME: Record<PapierkorbArt, string> = {
  FIRMA: 'Firma',
  KONTAKT: 'Kontakt',
  GESCHAEFT: 'Geschäft',
  AUFGABE: 'Aufgabe',
};

export const usePapierkorb = (
  art: PapierkorbArt,
  loeschen: DocumentNode,
  danach: () => void = () => undefined,
) => {
  const client = useApolloClient();
  const { zeige } = useToast();
  const [loeschMutation] = useMutation(loeschen);
  const [zurueck] = useMutation(WIEDERHERSTELLEN);

  return async (id: string, bezeichnung?: string): Promise<boolean> => {
    const ergebnis = await loeschMutation({ variables: { id } }).catch(
      (fehler: Error) => {
        zeige({ text: fehler.message });

        return null;
      },
    );

    if (ergebnis === null) {
      return false;
    }

    ausDemZwischenspeicher(client.cache, art, [id]);
    await client.refetchQueries({ include: 'active' });
    danach();
    zeige({
      text: `${bezeichnung === undefined ? NAME[art] : `„${bezeichnung}“`} liegt im Papierkorb.`,
      aktion: {
        label: 'Rückgängig',
        onClick: () => {
          void zurueck({ variables: { art, id } })
            .then(async () => {
              await client.refetchQueries({ include: 'active' });
              danach();
            })
            .catch((fehler: Error) => zeige({ text: fehler.message }));
        },
      },
    });

    return true;
  };
};
