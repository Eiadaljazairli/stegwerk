import { gql, useApolloClient, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { IconData } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { SICHERHEITS_TEXT } from '../components/SicherheitSection';
import { LoadingAnnouncement } from '../components/Skeleton';
import { einzelheitenText } from '../lib/protokollText';
import { TableWrap } from '../components/TableWrap';
import { TEAM_NAMEN } from '../components/Verantwortlich';
import { usePermissions } from '../lib/usePermissions';

export const BEREICHSPROTOKOLL = gql`
  query Bereichsprotokoll($filter: BereichsprotokollFilter) {
    bereichsprotokoll(filter: $filter) {
      eintraege {
        id
        quelle
        zeit
        wer
        art
        objekt
        objektId
        zusammenfassung
        einzelheiten
        geraet
      }
      weitere
      aenderungenMonate
      sicherheitMonate
    }
  }
`;

const BEREICHSPROTOKOLL_CSV = gql`
  query BereichsprotokollCsv($filter: BereichsprotokollFilter) {
    bereichsprotokollCsv(filter: $filter)
  }
`;

type Eintrag = {
  id: string;
  quelle: 'aenderung' | 'sicherheit';
  zeit: string;
  wer: string | null;
  art: string;
  objekt: string | null;
  objektId: string | null;
  zusammenfassung: string | null;
  einzelheiten: string | null;
  geraet: string | null;
};

const SEITE = 50;

const OBJEKTE: Record<string, { name: string; pfad?: string }> = {
  Company: { name: 'Firma', pfad: '/firmen' },
  Contact: { name: 'Kontakt', pfad: '/kontakte' },
  Deal: { name: 'Geschäft', pfad: '/geschaefte' },
  Task: { name: 'Aufgabe' },
  Note: { name: 'Notiz' },
};

const AKTION: Record<string, string> = {
  created: 'Angelegt',
  updated: 'Geändert',
  deleted: 'Gelöscht',
  restored: 'Wiederhergestellt',
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const tagesgrenze = (tag: string, ende: boolean): string | undefined =>
  tag === ''
    ? undefined
    : new Date(`${tag}T${ende ? '23:59:59.999' : '00:00:00'}`).toISOString();

export const ProtokollPage = () => {
  const rechte = usePermissions();
  const client = useApolloClient();
  const [quelle, setQuelle] = useState('');
  const [personId, setPersonId] = useState('');
  const [objekt, setObjekt] = useState('');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [csvFehler, setCsvFehler] = useState<string | null>(null);
  const filter = {
    quelle: quelle === '' ? undefined : quelle,
    personId: personId === '' ? undefined : personId,
    objekt: objekt === '' ? undefined : objekt,
    von: tagesgrenze(von, false),
    bis: tagesgrenze(bis, true),
  };
  const { data, loading, error, fetchMore } = useQuery<{
    bereichsprotokoll: {
      eintraege: Eintrag[];
      weitere: boolean;
      aenderungenMonate: number;
      sicherheitMonate: number;
    };
  }>(BEREICHSPROTOKOLL, {
    variables: { filter: { ...filter, limit: SEITE } },
    skip: !rechte.can('workspace:audit'),
    fetchPolicy: 'cache-and-network',
  });
  const { data: team } = useQuery<{
    workspaceMembers: {
      user: { id: string; firstName: string; lastName: string };
    }[];
  }>(TEAM_NAMEN);

  if (!rechte.loading && !rechte.can('workspace:audit')) {
    return (
      <div className="error-banner">
        Ihnen fehlt die Berechtigung, das Protokoll des Bereichs zu sehen.
      </div>
    );
  }

  const seite = data?.bereichsprotokoll;
  const eintraege = seite?.eintraege ?? [];

  const mehr = () =>
    void fetchMore({
      variables: {
        filter: { ...filter, limit: SEITE, offset: eintraege.length },
      },
      updateQuery: (alt, { fetchMoreResult }) => ({
        bereichsprotokoll: {
          ...fetchMoreResult.bereichsprotokoll,
          eintraege: [
            ...alt.bereichsprotokoll.eintraege,
            ...fetchMoreResult.bereichsprotokoll.eintraege,
          ],
        },
      }),
    });

  const alsCsv = async () => {
    setCsvFehler(null);

    try {
      const { data: antwort } = await client.query<{
        bereichsprotokollCsv: string;
      }>({
        query: BEREICHSPROTOKOLL_CSV,
        variables: { filter },
        fetchPolicy: 'no-cache',
      });
      const url = URL.createObjectURL(
        new Blob([antwort.bereichsprotokollCsv], {
          type: 'text/csv;charset=utf-8',
        }),
      );
      const link = document.createElement('a');

      link.href = url;
      link.download = 'Protokoll.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (fehler) {
      setCsvFehler((fehler as Error).message);
    }
  };

  return (
    <>
      <ObjectHeader
        hilfe="protokoll"
        kind="data"
        icon={IconData}
        label="Daten"
        title="Protokoll"
        note={
          seite === undefined
            ? 'Wer was wann geändert hat, und was am Zugang geschah.'
            : `Wer was wann geändert hat, und was am Zugang geschah. Änderungen bleiben ${String(seite.aenderungenMonate)} Monate, Sicherheitsereignisse ${String(seite.sicherheitMonate)} Monate.`
        }
        actions={
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void alsCsv()}
          >
            Als CSV
          </button>
        }
      />

      <form
        className="protokoll__filter"
        aria-label="Protokoll filtern"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="field">
          <span className="field__label">Quelle</span>
          <select
            value={quelle}
            onChange={(event) => {
              setQuelle(event.target.value);

              if (event.target.value === 'sicherheit') {
                setObjekt('');
              }
            }}
          >
            <option value="">Alles</option>
            <option value="aenderung">Änderungen an Datensätzen</option>
            <option value="sicherheit">Anmeldung und Sicherheit</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Person</span>
          <select
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
          >
            <option value="">Alle</option>
            {(team?.workspaceMembers ?? []).map(({ user }) => (
              <option key={user.id} value={user.id}>
                {`${user.firstName} ${user.lastName}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Objekt</span>
          <select
            value={objekt}
            disabled={quelle === 'sicherheit'}
            onChange={(event) => setObjekt(event.target.value)}
          >
            <option value="">Alle</option>
            {Object.entries(OBJEKTE).map(([typ, { name }]) => (
              <option key={typ} value={typ}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Von</span>
          <input
            type="date"
            value={von}
            onChange={(event) => setVon(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Bis</span>
          <input
            type="date"
            value={bis}
            onChange={(event) => setBis(event.target.value)}
          />
        </label>
      </form>

      {csvFehler !== null && <div className="error-banner">{csvFehler}</div>}
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      {loading && seite === undefined && <LoadingAnnouncement />}

      {seite !== undefined && eintraege.length === 0 && (
        <EmptyState
          title="Nichts gefunden"
          description="Für diese Auswahl gibt es keine Einträge."
        />
      )}

      {eintraege.length > 0 && (
        <TableWrap label="Protokoll">
          <table className="list-table">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Person</th>
                <th>Was</th>
                <th>Woran</th>
                <th>Einzelheiten</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => {
                const ziel = e.objekt === null ? undefined : OBJEKTE[e.objekt];

                return (
                  <tr key={`${e.quelle}-${e.id}`}>
                    <td>
                      <time dateTime={e.zeit}>
                        {ZEIT.format(new Date(e.zeit))}
                      </time>
                    </td>
                    <td>{e.wer ?? '—'}</td>
                    <td>
                      {e.quelle === 'sicherheit'
                        ? (SICHERHEITS_TEXT[e.art] ?? e.art)
                        : (AKTION[e.art] ?? e.art)}
                    </td>
                    <td>
                      {ziel === undefined ? (
                        (e.geraet ?? '—')
                      ) : ziel.pfad !== undefined &&
                        e.objektId !== null &&
                        e.art !== 'deleted' ? (
                        <Link to={`${ziel.pfad}/${e.objektId}`}>
                          {ziel.name}
                          {e.zusammenfassung === null
                            ? ''
                            : `: ${e.zusammenfassung}`}
                        </Link>
                      ) : (
                        `${ziel.name}${e.zusammenfassung === null ? '' : `: ${e.zusammenfassung}`}`
                      )}
                    </td>
                    <td className="protokoll__einzelheiten">
                      {einzelheitenText(e.quelle, e.einzelheiten)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {seite?.weitere === true && (
        <button
          type="button"
          className="button button--ghost"
          onClick={mehr}
          disabled={loading}
        >
          Weitere laden
        </button>
      )}
    </>
  );
};
