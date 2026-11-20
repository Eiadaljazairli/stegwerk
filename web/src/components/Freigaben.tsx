import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import {
  darfZugriffSehen,
  type FreigabeArt,
  freigabeKandidaten,
  type FreigabeStand,
  type FreigabeStufe,
  freigegebenFuer,
  STUFE_LABEL,
  type ZugriffZeile,
} from '../lib/freigaben';
import {
  FREIGABE_ENTZIEHEN,
  FREIGABE_STAND,
  FREIGEBEN,
  WER_SIEHT_DAS,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';
import { useToast } from './Toast';
import { personName, useTeam } from './Verantwortlich';

const LISTE: Record<FreigabeArt, string> = {
  company: '/firmen',
  contact: '/kontakte',
  deal: '/geschaefte',
};

const fehlerText = (problem: unknown, sonst: string): string =>
  problem instanceof Error ? problem.message : sonst;

const WerSiehtDas = ({
  art,
  datensatzId,
}: {
  art: FreigabeArt;
  datensatzId: string;
}) => {
  const [laden, { data, loading, error }] = useLazyQuery<{
    werSiehtDas: ZugriffZeile[];
  }>(WER_SIEHT_DAS, { fetchPolicy: 'network-only' });
  const [offen, setOffen] = useState(false);
  const tabelleId = useId();

  return (
    <div className="freigaben__wer">
      <button
        type="button"
        className="button button--ghost button--small"
        aria-expanded={offen}
        aria-controls={tabelleId}
        onClick={() => {
          if (!offen) {
            void laden({ variables: { art, datensatzId } });
          }

          setOffen(!offen);
        }}
      >
        Wer sieht das?
      </button>

      {offen && (
        <div id={tabelleId}>
          {error !== undefined && (
            <div className="error-banner" role="alert">
              {error.message}
            </div>
          )}
          {loading && <p className="related__empty">Wird geladen…</p>}
          {data !== undefined && (
            <table className="freigaben__tabelle">
              <caption className="visually-hidden">
                Wer diesen Datensatz sieht und ändern darf
              </caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">Sieht</th>
                  <th scope="col">Ändert</th>
                  <th scope="col">Warum</th>
                </tr>
              </thead>
              <tbody>
                {data.werSiehtDas.map((zeile) => (
                  <tr key={zeile.userId}>
                    <th scope="row">{zeile.name}</th>
                    <td>{zeile.rolle}</td>
                    <td>{zeile.sieht ? 'Ja' : 'Nein'}</td>
                    <td>{zeile.bearbeitet ? 'Ja' : 'Nein'}</td>
                    <td>{zeile.grund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export const Freigaben = ({
  art,
  datensatzId,
}: {
  art: FreigabeArt;
  datensatzId: string;
}) => {
  const { session } = useAuth();
  const { can } = usePermissions();
  const team = useTeam();
  const navigate = useNavigate();
  const { zeige } = useToast();
  const ichId = session?.user.id ?? null;
  const personId = useId();
  const stufeId = useId();
  const [fuer, setFuer] = useState('');
  const [stufe, setStufe] = useState<FreigabeStufe>('lesen');
  const [fehler, setFehler] = useState<string | null>(null);
  const { data, refetch } = useQuery<{ freigabeStand: FreigabeStand }>(
    FREIGABE_STAND,
    { variables: { art, datensatzId } },
  );
  const [freigeben, { loading }] = useMutation(FREIGEBEN);
  const [entziehen] = useMutation(FREIGABE_ENTZIEHEN);

  const stand = data?.freigabeStand;
  const zugriff = darfZugriffSehen(can);

  if (stand === undefined) {
    return null;
  }

  if (stand.freigaben.length === 0 && !stand.darfVerwalten && !zugriff) {
    return null;
  }

  const kandidaten = freigabeKandidaten(team, stand, ichId);
  const zeile = freigegebenFuer(stand.freigaben);

  const setzen = (userId: string, neueStufe: FreigabeStufe) => {
    setFehler(null);

    return freigeben({
      variables: {
        input: { art, datensatzId, userId, stufe: neueStufe },
      },
    })
      .then(() => refetch())
      .catch((problem: unknown) =>
        setFehler(fehlerText(problem, 'Das Freigeben ging nicht.')),
      );
  };

  return (
    <section className="card freigaben" aria-labelledby={`${personId}-titel`}>
      <h2 className="freigaben__titel" id={`${personId}-titel`}>
        Freigaben
      </h2>

      <p className="freigaben__zeile">
        {zeile === null
          ? 'Für niemanden zusätzlich freigegeben.'
          : `Freigegeben für ${zeile}.`}
      </p>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {stand.freigaben.length > 0 && (
        <ul className="freigaben__liste">
          {stand.freigaben.map((freigabe) => {
            const eigene = freigabe.userId === ichId;

            return (
              <li key={freigabe.id} className="freigaben__eintrag">
                <span className="freigaben__name">{freigabe.name}</span>
                {stand.darfVerwalten ? (
                  <select
                    aria-label={`Freigabe für ${freigabe.name}`}
                    value={freigabe.stufe}
                    onChange={(event) =>
                      void setzen(
                        freigabe.userId,
                        event.target.value as FreigabeStufe,
                      )
                    }
                  >
                    {(Object.keys(STUFE_LABEL) as FreigabeStufe[]).map(
                      (wert) => (
                        <option key={wert} value={wert}>
                          {STUFE_LABEL[wert]}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  <span className="freigaben__stufe">
                    {STUFE_LABEL[freigabe.stufe]}
                  </span>
                )}
                {freigabe.erteiltVon !== null && (
                  <span className="freigaben__von">
                    von {freigabe.erteiltVon}
                  </span>
                )}
                {(stand.darfVerwalten || eigene) && (
                  <button
                    type="button"
                    className="feed__link feed__link--danger"
                    onClick={() => {
                      setFehler(null);
                      void entziehen({ variables: { id: freigabe.id } })
                        .then(() => {
                          if (eigene && !stand.darfVerwalten) {
                            zeige({ text: 'Freigabe zurückgegeben.' });
                            void navigate(LISTE[art]);

                            return;
                          }

                          return refetch();
                        })
                        .catch((problem: unknown) =>
                          setFehler(
                            fehlerText(problem, 'Das Entziehen ging nicht.'),
                          ),
                        );
                    }}
                  >
                    {eigene ? 'Zurückgeben' : 'Entziehen'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {stand.darfVerwalten && kandidaten.length > 0 && (
        <form
          className="freigaben__form"
          onSubmit={(event) => {
            event.preventDefault();

            if (fuer === '') {
              return;
            }

            void setzen(fuer, stufe).then(() => setFuer(''));
          }}
        >
          <label htmlFor={personId}>Freigeben für</label>
          <select
            id={personId}
            value={fuer}
            onChange={(event) => setFuer(event.target.value)}
          >
            <option value="">Person wählen…</option>
            {kandidaten.map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)}
              </option>
            ))}
          </select>
          <label htmlFor={stufeId}>zum</label>
          <select
            id={stufeId}
            value={stufe}
            onChange={(event) => setStufe(event.target.value as FreigabeStufe)}
          >
            {(Object.keys(STUFE_LABEL) as FreigabeStufe[]).map((wert) => (
              <option key={wert} value={wert}>
                {STUFE_LABEL[wert]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="button button--small"
            disabled={loading || fuer === ''}
          >
            Freigeben
          </button>
        </form>
      )}

      {stand.darfVerwalten && (
        <p className="freigaben__hinweis">
          Eine Freigabe zeigt den Datensatz auch Kollegen, deren Rolle nur
          eigene sieht. Was ihre Rolle nicht erlaubt, erlaubt die Freigabe
          nicht.
        </p>
      )}

      {zugriff && <WerSiehtDas art={art} datensatzId={datensatzId} />}
    </section>
  );
};
