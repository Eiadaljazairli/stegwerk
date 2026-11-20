import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AkteFehlt } from '../components/AkteFehlt';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { IconArrowLeft, IconContacts } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { TableWrap } from '../components/TableWrap';
import {
  SAVED_VIEWS,
  VERTEILER_AENDERN,
  VERTEILER_ANLEGEN,
  VERTEILER_ENTFERNEN,
  VERTEILER_LISTE,
  VERTEILER_LOESCHEN,
  VERTEILER_MITGLIEDER,
} from '../lib/queries';
import { type Verteiler, type VerteilerMitglied } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';

const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

const Liste = () => {
  const navigate = useNavigate();
  const rechte = usePermissions();
  const darfSchreiben = rechte.can('contact:write');
  const { data, loading, error } = useQuery<{ verteilerListe: Verteiler[] }>(
    VERTEILER_LISTE,
  );
  const { data: ansichten } = useQuery<{
    savedViews: { id: string; name: string }[];
  }>(SAVED_VIEWS, { variables: { entity: 'CONTACT' } });
  const [name, setName] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [anlegen, angelegt] = useMutation<{ verteilerAnlegen: Verteiler }>(
    VERTEILER_ANLEGEN,
    { refetchQueries: [VERTEILER_LISTE] },
  );
  const liste = data?.verteilerListe ?? [];

  const absenden = (event: FormEvent): void => {
    event.preventDefault();
    void anlegen({
      variables: {
        input: {
          name,
          beschreibung: beschreibung === '' ? null : beschreibung,
        },
      },
    })
      .then((antwort) => {
        const id = antwort.data?.verteilerAnlegen.id;

        setName('');
        setBeschreibung('');

        if (id !== undefined) {
          navigate(`/verteiler/${id}`);
        }
      })
      .catch(() => null);
  };

  return (
    <>
      <ObjectHeader
        hilfe="verteiler"
        kind="contact"
        icon={IconContacts}
        label="Verteiler"
        anzahl={liste.length}
        note="Feste Empfängerlisten für Serienmails. Gefüllt über „Zu Verteiler hinzufügen“ in der Kontaktliste."
      />

      {error !== undefined && (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      )}

      {loading ? (
        <LoadingAnnouncement />
      ) : liste.length === 0 ? (
        <EmptyState
          title="Noch kein Verteiler"
          description="Markieren Sie in der Kontaktliste die Empfänger und wählen Sie „Zu Verteiler hinzufügen“ — oder legen Sie hier einen leeren an."
        />
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kontakte</th>
                <th scope="col">Beschreibung</th>
                <th scope="col">Geändert</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((verteiler) => (
                <tr key={verteiler.id}>
                  <td>
                    <Link to={`/verteiler/${verteiler.id}`}>
                      {verteiler.name}
                    </Link>
                  </td>
                  <td>{verteiler.anzahl}</td>
                  <td>{verteiler.beschreibung ?? ''}</td>
                  <td>{DATUM.format(new Date(verteiler.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {darfSchreiben && (
        <section className="card verteiler__form">
          <h2>Neuer Verteiler</h2>
          <form onSubmit={absenden}>
            <div className="field">
              <label htmlFor="verteiler-name">Name</label>
              <input
                id="verteiler-name"
                required
                maxLength={120}
                placeholder="z. B. Einladung Hausmesse"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="verteiler-beschreibung">Beschreibung</label>
              <input
                id="verteiler-beschreibung"
                maxLength={500}
                value={beschreibung}
                onChange={(event) => setBeschreibung(event.target.value)}
              />
            </div>
            {angelegt.error !== undefined && (
              <div className="error-banner" role="alert">
                {angelegt.error.message}
              </div>
            )}
            <button
              type="submit"
              className="button"
              disabled={angelegt.loading}
            >
              Anlegen
            </button>
          </form>
        </section>
      )}

      <section className="detail-section">
        <h2>Gespeicherte Filter</h2>
        <p className="field__hint">
          Eine gespeicherte Kontaktansicht ist ein Verteiler, der sich selbst
          aktuell hält: wer zum Filter passt, wenn die Serienmail die Empfänger
          übernimmt, bekommt sie. Anlegen in der{' '}
          <Link to="/kontakte">Kontaktliste</Link> über „Ansicht speichern“.
        </p>
        {(ansichten?.savedViews ?? []).length === 0 ? (
          <p className="field__hint">Noch keine gespeicherte Ansicht.</p>
        ) : (
          <ul className="verteiler__ansichten">
            {(ansichten?.savedViews ?? []).map((ansicht) => (
              <li key={ansicht.id}>{ansicht.name}</li>
            ))}
          </ul>
        )}
        <p className="field__hint">
          Wer sich abgemeldet hat, steht in der{' '}
          <Link to="/serienmails">Abmeldeliste bei den Serienmails</Link> und
          wird bei jedem Versand übersprungen.
        </p>
      </section>
    </>
  );
};

const Einzeln = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const rechte = usePermissions();
  const darfSchreiben = rechte.can('contact:write');
  const darfSenden = rechte.can('workspace:campaigns');
  const { data, loading, error } = useQuery<{
    verteiler: Verteiler;
    verteilerMitglieder: VerteilerMitglied[];
  }>(VERTEILER_MITGLIEDER, { variables: { id } });
  const nachher = {
    refetchQueries: [VERTEILER_MITGLIEDER, VERTEILER_LISTE],
  };
  const [entfernen, entfernt] = useMutation(VERTEILER_ENTFERNEN, nachher);
  const [aendern, geaendert] = useMutation(VERTEILER_AENDERN, nachher);
  const [loeschen, geloescht] = useMutation(VERTEILER_LOESCHEN, {
    refetchQueries: [VERTEILER_LISTE],
  });
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const [bearbeitet, setBearbeitet] = useState<{
    name: string;
    beschreibung: string;
  } | null>(null);

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/verteiler', label: 'Zu den Verteilern' }}
      />
    );
  }

  if (loading || data === undefined) {
    return <LoadingAnnouncement />;
  }

  const { verteiler, verteilerMitglieder: mitglieder } = data;
  const abgemeldet = mitglieder.filter((m) => m.abgemeldet).length;

  return (
    <>
      <ObjectHeader
        hilfe="verteiler"
        kind="contact"
        icon={IconContacts}
        label="Verteiler"
        title={verteiler.name}
        note={
          verteiler.beschreibung ??
          `${String(verteiler.anzahl)} Kontakte${
            abgemeldet > 0 ? `, davon ${String(abgemeldet)} abgemeldet` : ''
          }`
        }
        actions={
          <>
            {darfSenden && (
              <Link
                className="button"
                to={`/serienmails?verteiler=${encodeURIComponent(verteiler.id)}`}
              >
                Serienmail an diesen Verteiler
              </Link>
            )}
            {darfSchreiben && (
              <>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    setBearbeitet({
                      name: verteiler.name,
                      beschreibung: verteiler.beschreibung ?? '',
                    })
                  }
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  className="button button--ghost button--danger"
                  onClick={() => setFragtLoeschen(true)}
                >
                  Löschen
                </button>
              </>
            )}
          </>
        }
      />

      <p>
        <Link to="/verteiler" className="back-link">
          <IconArrowLeft size={14} /> Alle Verteiler
        </Link>
      </p>

      {bearbeitet !== null && (
        <form
          className="card verteiler__form"
          onSubmit={(event) => {
            event.preventDefault();
            void aendern({
              variables: {
                id,
                input: {
                  name: bearbeitet.name,
                  beschreibung:
                    bearbeitet.beschreibung === ''
                      ? null
                      : bearbeitet.beschreibung,
                },
              },
            })
              .then(() => setBearbeitet(null))
              .catch(() => null);
          }}
        >
          <div className="field">
            <label htmlFor="verteiler-neuer-name">Name</label>
            <input
              id="verteiler-neuer-name"
              required
              maxLength={120}
              value={bearbeitet.name}
              onChange={(event) =>
                setBearbeitet({ ...bearbeitet, name: event.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="verteiler-neue-beschreibung">Beschreibung</label>
            <input
              id="verteiler-neue-beschreibung"
              maxLength={500}
              value={bearbeitet.beschreibung}
              onChange={(event) =>
                setBearbeitet({
                  ...bearbeitet,
                  beschreibung: event.target.value,
                })
              }
            />
          </div>
          {geaendert.error !== undefined && (
            <div className="error-banner" role="alert">
              {geaendert.error.message}
            </div>
          )}
          <div className="row-actions">
            <button type="submit" className="button">
              Speichern
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setBearbeitet(null)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {entfernt.error !== undefined && (
        <div className="error-banner" role="alert">
          {entfernt.error.message}
        </div>
      )}

      {geloescht.error !== undefined && (
        <div className="error-banner" role="alert">
          Der Verteiler wurde nicht gelöscht: {geloescht.error.message}
        </div>
      )}

      {mitglieder.length === 0 ? (
        <EmptyState
          title="Noch leer"
          description="Markieren Sie in der Kontaktliste die Empfänger und wählen Sie „Zu Verteiler hinzufügen“."
        />
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Firma</th>
                <th scope="col">E-Mail</th>
                <th scope="col">Seit</th>
                {darfSchreiben && (
                  <th scope="col">
                    <span className="visually-hidden">Aktionen</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {mitglieder.map(({ contact, hinzugefuegtAm, abgemeldet: ab }) => {
                const wer = `${contact.firstName} ${contact.lastName}`.trim();

                return (
                  <tr key={contact.id}>
                    <td>
                      <Link to={`/kontakte/${contact.id}`}>{wer}</Link>
                      {ab && (
                        <span className="quelle-badge quelle-badge--privat">
                          abgemeldet
                        </span>
                      )}
                    </td>
                    <td>{contact.company?.name ?? ''}</td>
                    <td>{contact.email ?? '—'}</td>
                    <td>{DATUM.format(new Date(hinzugefuegtAm))}</td>
                    {darfSchreiben && (
                      <td>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          aria-label={`${wer} aus dem Verteiler nehmen`}
                          onClick={() =>
                            void entfernen({
                              variables: { id, kontaktIds: [contact.id] },
                            }).catch(() => null)
                          }
                        >
                          Herausnehmen
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {fragtLoeschen && (
        <ConfirmDialog
          title={`Verteiler „${verteiler.name}“ löschen?`}
          consequence="Die Kontakte bleiben, nur die Liste geht. Gestartete Serienmails behalten ihre Empfänger."
          confirmLabel="Löschen"
          onCancel={() => setFragtLoeschen(false)}
          onConfirm={() => {
            setFragtLoeschen(false);
            void loeschen({ variables: { id } })
              .then(() => navigate('/verteiler'))
              .catch(() => undefined);
          }}
        />
      )}
    </>
  );
};

export const VerteilerPage = () => {
  const { id } = useParams<{ id: string }>();

  return id === undefined ? <Liste /> : <Einzeln id={id} />;
};
