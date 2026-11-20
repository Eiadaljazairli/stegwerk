import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErsteSchritte } from '../components/ErsteSchritte';
import { FavoritenKarte } from '../components/Favoriten';
import { useToast } from '../components/Toast';
import {
  type Dashboard,
  DashboardFlaeche,
  Uebersicht,
} from '../components/Uebersicht';
import { useAuth } from '../lib/auth';
import {
  DASHBOARD_AENDERN,
  DASHBOARD_ANLEGEN,
  DASHBOARD_LOESCHEN,
  DASHBOARDS,
} from '../lib/queries';

type Formular =
  | { art: 'neu'; name: string; privat: boolean; vonUebersicht: boolean }
  | { art: 'umbenennen'; name: string; privat: boolean }
  | null;

export const DashboardPage = () => {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [suche, setSuche] = useSearchParams();
  const [formular, setFormular] = useState<Formular>(null);
  const [loeschenFragen, setLoeschenFragen] = useState(false);
  const toast = useToast();
  const { session } = useAuth();
  const { data } = useQuery<{ dashboards: Dashboard[] }>(DASHBOARDS);
  const fehlerZeigen = (fehler: Error) => toast.zeige({ text: fehler.message });
  const neuLaden = { refetchQueries: [{ query: DASHBOARDS }] };
  const [anlegen, { loading: legtAn }] = useMutation<{
    dashboardAnlegen: Dashboard;
  }>(DASHBOARD_ANLEGEN, {
    update: (cache, { data: antwort }) => {
      const neu = antwort?.dashboardAnlegen;
      const bisher = cache.readQuery<{ dashboards: Dashboard[] }>({
        query: DASHBOARDS,
      });

      if (neu !== undefined && bisher !== null) {
        cache.writeQuery({
          query: DASHBOARDS,
          data: {
            dashboards: [...bisher.dashboards, neu].sort((a, b) =>
              a.name.localeCompare(b.name, 'de'),
            ),
          },
        });
      }
    },
  });
  const [aendern] = useMutation(DASHBOARD_AENDERN);
  const [loeschen] = useMutation(DASHBOARD_LOESCHEN, neuLaden);

  const dashboards = data?.dashboards ?? [];
  const gewaehltId = suche.get('dashboard') ?? '';
  const gewaehlt = dashboards.find((eintrag) => eintrag.id === gewaehltId);
  const istUebersicht = gewaehlt === undefined;
  const darfAnpassen = istUebersicht || gewaehlt.darfAendern;

  const waehle = (id: string) => {
    setBearbeiten(false);
    setFormular(null);
    setSuche(id === '' ? {} : { dashboard: id });
  };

  const absenden = async (event: FormEvent) => {
    event.preventDefault();

    if (formular === null) {
      return;
    }

    if (formular.art === 'neu') {
      const ergebnis = await anlegen({
        variables: {
          input: {
            name: formular.name,
            privat: formular.privat,
            vonUebersicht: formular.vonUebersicht,
          },
        },
      }).catch((fehler: Error) => {
        fehlerZeigen(fehler);

        return null;
      });
      const neu = ergebnis?.data?.dashboardAnlegen;

      if (neu !== undefined) {
        waehle(neu.id);
        setBearbeiten(!formular.vonUebersicht);
      }

      return;
    }

    if (gewaehlt === undefined) {
      return;
    }

    const ok = await aendern({
      variables: {
        id: gewaehlt.id,
        input: {
          name: formular.name,
          ...(gewaehlt.createdById === session?.user.id
            ? { privat: formular.privat }
            : {}),
        },
      },
    })
      .then(() => true)
      .catch((fehler: Error) => {
        fehlerZeigen(fehler);

        return false;
      });

    if (ok) {
      setFormular(null);
    }
  };

  const titel = istUebersicht ? 'Übersicht' : gewaehlt.name;
  const untertitel = istUebersicht
    ? 'Ihr Vertrieb auf einen Blick.'
    : gewaehlt.privat
      ? 'Nur für Sie.'
      : 'Für das ganze Team. Jede Person sieht darin, was ihre Rolle erlaubt.';

  return (
    <>
      <div className="page__header">
        <div>
          <h1>{titel}</h1>
          <p className="page__subtitle">{untertitel}</p>
        </div>
        <div className="dashboard-kopf">
          {dashboards.length > 0 && (
            <select
              className="toolbar__filter"
              aria-label="Dashboard wählen"
              value={gewaehlt?.id ?? ''}
              onChange={(event) => waehle(event.target.value)}
            >
              <option value="">Übersicht</option>
              {dashboards.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.name}
                  {eintrag.privat ? ' (nur für mich)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setFormular({
                art: 'neu',
                name: '',
                privat: false,
                vonUebersicht: false,
              })
            }
          >
            Neues Dashboard
          </button>
          {!istUebersicht && gewaehlt.darfAendern && (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  setFormular({
                    art: 'umbenennen',
                    name: gewaehlt.name,
                    privat: gewaehlt.privat,
                  })
                }
              >
                Umbenennen
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setLoeschenFragen(true)}
              >
                Löschen
              </button>
            </>
          )}
          {darfAnpassen && (
            <button
              type="button"
              className={bearbeiten ? 'button' : 'button button--ghost'}
              aria-pressed={bearbeiten}
              onClick={() => setBearbeiten(!bearbeiten)}
            >
              {bearbeiten ? 'Fertig' : 'Anpassen'}
            </button>
          )}
        </div>
      </div>

      {formular !== null && (
        <form
          className="card dashboard-formular"
          onSubmit={(event) => void absenden(event)}
        >
          <h2>
            {formular.art === 'neu'
              ? 'Neues Dashboard'
              : 'Dashboard umbenennen'}
          </h2>
          <label>
            Name
            <input
              value={formular.name}
              maxLength={60}
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(event) =>
                setFormular({ ...formular, name: event.target.value })
              }
            />
          </label>
          {(formular.art === 'neu' ||
            gewaehlt?.createdById === session?.user.id) && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={formular.privat}
                onChange={(event) =>
                  setFormular({ ...formular, privat: event.target.checked })
                }
              />
              Nur für mich
            </label>
          )}
          {formular.art === 'neu' && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={formular.vonUebersicht}
                onChange={(event) =>
                  setFormular({
                    ...formular,
                    vonUebersicht: event.target.checked,
                  })
                }
              />
              Mit den Kacheln meiner Übersicht beginnen
            </label>
          )}
          <div className="dashboard-formular__knoepfe">
            <button className="button" type="submit" disabled={legtAn}>
              {formular.art === 'neu' ? 'Anlegen' : 'Speichern'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setFormular(null)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {loeschenFragen && gewaehlt !== undefined && (
        <ConfirmDialog
          title={`„${gewaehlt.name}“ löschen?`}
          consequence={
            gewaehlt.privat
              ? 'Das Dashboard und seine Anordnung sind weg. Ihre Daten bleiben, wie sie sind.'
              : 'Das Dashboard verschwindet für das ganze Team. Die Daten selbst bleiben, wie sie sind.'
          }
          confirmLabel="Löschen"
          onCancel={() => setLoeschenFragen(false)}
          onConfirm={() => {
            setLoeschenFragen(false);
            void loeschen({ variables: { id: gewaehlt.id } })
              .then(() => waehle(''))
              .catch(fehlerZeigen);
          }}
        />
      )}

      {istUebersicht && !bearbeiten && <ErsteSchritte />}
      {istUebersicht && !bearbeiten && <FavoritenKarte />}

      {istUebersicht && gewaehltId !== '' && data === undefined ? (
        <div className="state">Wird geladen…</div>
      ) : istUebersicht ? (
        <Uebersicht bearbeiten={bearbeiten} />
      ) : (
        <DashboardFlaeche dashboard={gewaehlt} bearbeiten={bearbeiten} />
      )}
    </>
  );
};
