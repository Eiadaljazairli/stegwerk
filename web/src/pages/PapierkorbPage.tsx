import { gql, useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { IconData } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { type PapierkorbArt, WIEDERHERSTELLEN } from '../lib/usePapierkorb';
import { formatDate } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';
import { TableWrap } from '../components/TableWrap';

const PAPIERKORB = gql`
  query Papierkorb {
    papierkorb {
      art
      id
      name
      geloeschtAm
      endgueltigAm
      geloeschtVon
    }
  }
`;

const FRIST = gql`
  query PapierkorbTage {
    papierkorbTage
  }
`;

const FRIST_SETZEN = gql`
  mutation SetPapierkorbTage($tage: Int!) {
    setPapierkorbTage(tage: $tage) {
      id
      papierkorbTage
    }
  }
`;

const MIN_TAGE = 1;
const MAX_TAGE = 365;
const TAG = 86_400_000;

const ENDGUELTIG = gql`
  mutation EndgueltigLoeschen($art: PapierkorbArt!, $id: ID!) {
    endgueltigLoeschen(art: $art, id: $id)
  }
`;

type Eintrag = {
  art: PapierkorbArt;
  id: string;
  name: string;
  geloeschtAm: string;
  endgueltigAm: string;
  geloeschtVon: string | null;
};

const ART: Record<PapierkorbArt, string> = {
  FIRMA: 'Firma',
  KONTAKT: 'Kontakt',
  GESCHAEFT: 'Geschäft',
  AUFGABE: 'Aufgabe',
};

export const PapierkorbPage = () => {
  const { zeige } = useToast();
  const { data, loading, error } = useQuery<{ papierkorb: Eintrag[] }>(
    PAPIERKORB,
    { fetchPolicy: 'cache-and-network' },
  );
  const [zurueck] = useMutation(WIEDERHERSTELLEN, {
    refetchQueries: [PAPIERKORB],
  });
  const [weg] = useMutation(ENDGUELTIG, { refetchQueries: [PAPIERKORB] });
  const [fragen, setFragen] = useState<Eintrag | null>(null);
  const { can } = usePermissions();
  const darfFrist = can('workspace:fields');
  const frist = useQuery<{ papierkorbTage: number }>(FRIST);
  const tage = frist.data?.papierkorbTage ?? 30;
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [kuerzer, setKuerzer] = useState<{ tage: number; weg: number } | null>(
    null,
  );
  const [fristSetzen, { loading: fristSpeichert }] = useMutation(FRIST_SETZEN, {
    refetchQueries: [FRIST, PAPIERKORB],
  });

  const speichereFrist = (neu: number) => {
    void fristSetzen({ variables: { tage: neu } })
      .then(() => {
        setEntwurf(null);
        zeige({ text: `Gelöschtes bleibt jetzt ${neu} Tage im Papierkorb.` });
      })
      .catch((fehler: Error) => zeige({ text: fehler.message }));
  };

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const eintraege = data?.papierkorb ?? [];
  const entwurfZahl = entwurf === null ? tage : Number(entwurf);
  const entwurfGueltig =
    Number.isInteger(entwurfZahl) &&
    entwurfZahl >= MIN_TAGE &&
    entwurfZahl <= MAX_TAGE;

  const fristAendern = () => {
    if (!entwurfGueltig || entwurfZahl === tage) {
      return;
    }

    const weg = eintraege.filter(
      (e) => new Date(e.geloeschtAm).getTime() + entwurfZahl * TAG < Date.now(),
    ).length;

    if (entwurfZahl < tage && weg > 0) {
      setKuerzer({ tage: entwurfZahl, weg });

      return;
    }

    speichereFrist(entwurfZahl);
  };

  return (
    <>
      {fragen !== null && (
        <ConfirmDialog
          title="Endgültig löschen?"
          consequence={`„${fragen.name}“ wird sofort und unwiderruflich gelöscht, samt allem, was daran hängt.`}
          confirmLabel="Endgültig löschen"
          onCancel={() => setFragen(null)}
          onConfirm={() => {
            const eintrag = fragen;

            setFragen(null);
            void weg({ variables: { art: eintrag.art, id: eintrag.id } })
              .then(() =>
                zeige({ text: `„${eintrag.name}“ ist endgültig gelöscht.` }),
              )
              .catch((fehler: Error) => zeige({ text: fehler.message }));
          }}
        />
      )}

      {kuerzer !== null && (
        <ConfirmDialog
          title="Frist verkürzen?"
          consequence={`${kuerzer.weg} ${kuerzer.weg === 1 ? 'Eintrag liegt' : 'Einträge liegen'} schon länger als ${kuerzer.tage} Tage im Papierkorb und ${kuerzer.weg === 1 ? 'wird' : 'werden'} innerhalb der nächsten Stunde endgültig gelöscht.`}
          confirmLabel="Frist verkürzen"
          onCancel={() => setKuerzer(null)}
          onConfirm={() => {
            const neu = kuerzer.tage;

            setKuerzer(null);
            speichereFrist(neu);
          }}
        />
      )}

      <ObjectHeader
        hilfe="papierkorb"
        kind="data"
        icon={IconData}
        label="Daten"
        title="Papierkorb"
        note={`Gelöschte Firmen, Kontakte, Geschäfte und Aufgaben bleiben ${tage} ${tage === 1 ? 'Tag' : 'Tage'} hier und lassen sich mit allem, was daran hing, zurückholen. Danach sind sie endgültig weg.`}
      />

      {darfFrist && (
        <form
          className="papierkorb__frist"
          onSubmit={(event) => {
            event.preventDefault();
            fristAendern();
          }}
        >
          <label className="field" htmlFor="papierkorb-frist">
            <span className="field__label">Aufbewahren für</span>
            <span className="papierkorb__frist-eingabe">
              <input
                id="papierkorb-frist"
                type="number"
                inputMode="numeric"
                min={MIN_TAGE}
                max={MAX_TAGE}
                step={1}
                value={entwurf ?? String(tage)}
                aria-describedby="papierkorb-frist-hinweis"
                aria-invalid={!entwurfGueltig}
                onChange={(event) => setEntwurf(event.target.value)}
              />
              <span>Tage</span>
            </span>
          </label>
          <button
            type="submit"
            className="button button--ghost"
            disabled={!entwurfGueltig || entwurfZahl === tage || fristSpeichert}
          >
            Speichern
          </button>
          <span className="field__hint" id="papierkorb-frist-hinweis">
            {entwurfGueltig
              ? 'Gilt für alles im Papierkorb, auch für schon Gelöschtes.'
              : `Zwischen ${MIN_TAGE} und ${MAX_TAGE} Tagen.`}
          </span>
        </form>
      )}

      {eintraege.length === 0 ? (
        <EmptyState
          title="Der Papierkorb ist leer"
          description="Was Sie löschen, landet zuerst hier."
        />
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Art</th>
                <th>Bezeichnung</th>
                <th>Gelöscht</th>
                <th>Von</th>
                <th>Endgültig weg am</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((eintrag) => (
                <tr key={`${eintrag.art}-${eintrag.id}`}>
                  <td data-label="Art">{ART[eintrag.art]}</td>
                  <td data-label="Bezeichnung">{eintrag.name}</td>
                  <td data-label="Gelöscht">
                    {formatDate(eintrag.geloeschtAm)}
                  </td>
                  <td data-label="Von">{eintrag.geloeschtVon ?? '—'}</td>
                  <td data-label="Endgültig weg am">
                    {formatDate(eintrag.endgueltigAm)}
                  </td>
                  <td className="papierkorb__aktionen">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() =>
                        void zurueck({
                          variables: { art: eintrag.art, id: eintrag.id },
                        })
                          .then(() =>
                            zeige({ text: `„${eintrag.name}“ ist wieder da.` }),
                          )
                          .catch((fehler: Error) =>
                            zeige({ text: fehler.message }),
                          )
                      }
                    >
                      Wiederherstellen
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--danger"
                      onClick={() => setFragen(eintrag)}
                    >
                      Endgültig löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
};
