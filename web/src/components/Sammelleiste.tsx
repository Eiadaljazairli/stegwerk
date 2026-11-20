import { gql, useApolloClient, useMutation } from '@apollo/client';
import { useEffect, useMemo, useState } from 'react';

import { downloadExport } from '../lib/download';
import {
  ausDemZwischenspeicher,
  type PapierkorbArt,
  WIEDERHERSTELLEN,
} from '../lib/usePapierkorb';
import { usePermissions } from '../lib/usePermissions';
import { useToast } from './Toast';
import { personName, useTeam } from './Verantwortlich';

const SAMMEL_LOESCHEN = gql`
  mutation SammelLoeschen($art: PapierkorbArt!, $ids: [ID!]!) {
    sammelLoeschen(art: $art, ids: $ids)
  }
`;

const SAMMEL_VERANTWORTLICH = gql`
  mutation SammelVerantwortlich(
    $art: PapierkorbArt!
    $ids: [ID!]!
    $ownerId: ID
  ) {
    sammelVerantwortlich(art: $art, ids: $ids, ownerId: $ownerId)
  }
`;

export type Auswahl = {
  gewaehlt: Set<string>;
  setzen: (ids: Set<string>) => void;
  leeren: () => void;
};

export const useAuswahl = (sichtbar: string[]): Auswahl => {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const schluessel = sichtbar.join(',');

  useEffect(() => {
    setGewaehlt((alt) => {
      const da = new Set(schluessel === '' ? [] : schluessel.split(','));
      const neu = new Set([...alt].filter((id) => da.has(id)));

      return neu.size === alt.size ? alt : neu;
    });
  }, [schluessel]);

  return useMemo(
    () => ({
      gewaehlt,
      setzen: setGewaehlt,
      leeren: () => setGewaehlt(new Set()),
    }),
    [gewaehlt],
  );
};

const EXPORT_ART: Partial<
  Record<PapierkorbArt, 'company' | 'contact' | 'deal'>
> = { FIRMA: 'company', KONTAKT: 'contact', GESCHAEFT: 'deal' };

const anzahl = (n: number, eins: string, viele: string) =>
  `${n} ${n === 1 ? eins : viele}`;

export const Sammelleiste = ({
  art,
  auswahl,
  einzahl,
  mehrzahl,
  mitVerantwortlich = true,
  children,
}: {
  art: PapierkorbArt;
  auswahl: Auswahl;
  einzahl: string;
  mehrzahl: string;
  mitVerantwortlich?: boolean;
  children?: React.ReactNode;
}) => {
  const client = useApolloClient();
  const { zeige } = useToast();
  const team = useTeam();
  const [loeschen, { loading: loescht }] = useMutation(SAMMEL_LOESCHEN);
  const [zuweisen] = useMutation(SAMMEL_VERANTWORTLICH);
  const [zurueck] = useMutation(WIEDERHERSTELLEN);
  const { can } = usePermissions();
  const ids = [...auswahl.gewaehlt];
  const exportArt = EXPORT_ART[art];

  if (ids.length === 0) {
    return null;
  }

  const neuLaden = () => client.refetchQueries({ include: 'active' });

  const allesLoeschen = async () => {
    const ergebnis = await loeschen({ variables: { art, ids } }).catch(
      (fehler: Error) => {
        zeige({ text: fehler.message });

        return null;
      },
    );

    if (ergebnis === null) {
      return;
    }

    const n = Number(ergebnis.data?.sammelLoeschen ?? 0);

    if (n === ids.length) {
      ausDemZwischenspeicher(client.cache, art, ids);
    }

    auswahl.leeren();
    await neuLaden();
    zeige({
      text: `${anzahl(n, einzahl, mehrzahl)} im Papierkorb.`,
      aktion: {
        label: 'Rückgängig',
        onClick: () => {
          void Promise.all(
            ids.map((id) =>
              zurueck({ variables: { art, id } }).catch(() => null),
            ),
          ).then(() => neuLaden());
        },
      },
    });
  };

  return (
    <div className="sammelleiste" role="region" aria-label="Auswahl bearbeiten">
      <strong>{anzahl(ids.length, einzahl, mehrzahl)} ausgewählt</strong>

      {mitVerantwortlich && (
        <select
          aria-label="Verantwortlich setzen"
          value=""
          onChange={(event) => {
            const wert = event.target.value;
            const ownerId = wert === 'niemand' ? null : wert;

            void zuweisen({ variables: { art, ids, ownerId } })
              .then(async (r) => {
                await neuLaden();
                zeige({
                  text: `${anzahl(Number(r.data?.sammelVerantwortlich ?? 0), einzahl, mehrzahl)} zugewiesen.`,
                });
              })
              .catch((fehler: Error) => zeige({ text: fehler.message }));
          }}
        >
          <option value="" disabled>
            Verantwortlich setzen…
          </option>
          <option value="niemand">— niemand —</option>
          {team.map((person) => (
            <option key={person.id} value={person.id}>
              {personName(person)}
            </option>
          ))}
        </select>
      )}

      {children}

      {exportArt !== undefined && can('workspace:export') && (
        <button
          type="button"
          className="button button--ghost"
          onClick={() =>
            void downloadExport(exportArt, { ids }).catch((fehler: Error) =>
              zeige({ text: fehler.message }),
            )
          }
        >
          Exportieren
        </button>
      )}

      <button
        type="button"
        className="button button--danger"
        disabled={loescht}
        onClick={() => void allesLoeschen()}
      >
        Löschen
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={auswahl.leeren}
      >
        Auswahl aufheben
      </button>
    </div>
  );
};
