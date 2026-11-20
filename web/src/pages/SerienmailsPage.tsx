import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { IconMail } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  ABMELDUNGEN,
  KAMPAGNE,
  KAMPAGNE_ABBRECHEN,
  KAMPAGNE_AENDERN,
  KAMPAGNEN_THEMEN,
  KAMPAGNE_ANLEGEN,
  KAMPAGNE_LOESCHEN,
  KAMPAGNE_STARTEN,
  KAMPAGNE_TESTMAIL,
  KAMPAGNEN,
  KAMPAGNEN_EMPFAENGER,
  KAMPAGNEN_EMPFAENGER_FESTLEGEN,
  KAMPAGNEN_VORSCHAU,
  ABSENDER_PRUEFUNG,
  SAVED_VIEWS,
  VERTEILER_LISTE,
} from '../lib/queries';
import { type Verteiler } from '../lib/types';
import {
  type AbsenderPruefung,
  empfaengerAuswahl,
  serienmailWarnung,
} from '../lib/zustellbarkeit';
import { AkteFehlt } from '../components/AkteFehlt';
import { TableWrap } from '../components/TableWrap';

export const AUSWAHL_SCHLUESSEL = 'stegwerk.serienmail.kontakte';

type Kampagne = {
  id: string;
  name: string;
  betreff: string;
  text: string;
  thema: string;
  status: 'entwurf' | 'laeuft' | 'fertig' | 'abgebrochen';
  gestartetAm: string | null;
  beendetAm: string | null;
  createdAt: string;
  geplant: number;
  gesendet: number;
  uebersprungen: number;
  fehler: number;
};

type Empfaenger = {
  id: string;
  contactId: string | null;
  email: string | null;
  vorname: string;
  nachname: string;
  firma: string;
  status: string;
  grund: string | null;
  gesendetAm: string | null;
};

const STATUS: Record<Kampagne['status'], string> = {
  entwurf: 'Entwurf',
  laeuft: 'Wird verschickt',
  fertig: 'Verschickt',
  abgebrochen: 'Abgebrochen',
};

const EMPFAENGER_STATUS: Record<string, string> = {
  geplant: 'Geplant',
  sendet: 'Wird gesendet',
  gesendet: 'Gesendet',
  uebersprungen: 'Übersprungen',
  fehler: 'Fehler',
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const gemerkteAuswahl = (): string[] => {
  try {
    const roh = window.sessionStorage.getItem(AUSWAHL_SCHLUESSEL);
    const liste: unknown = roh === null ? [] : JSON.parse(roh);

    return Array.isArray(liste) ? liste.map(String) : [];
  } catch {
    return [];
  }
};

const LEER = { name: '', betreff: '', text: '', thema: 'allgemein' };

const Liste = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery<{ kampagnen: Kampagne[] }>(
    KAMPAGNEN,
  );
  const [suche] = useSearchParams();
  const verteilerId = suche.get('verteiler');
  const [offen, setOffen] = useState(
    gemerkteAuswahl().length > 0 || verteilerId !== null,
  );
  const [form, setForm] = useState(LEER);
  const [anlegen, angelegt] = useMutation<{ kampagneAnlegen: Kampagne }>(
    KAMPAGNE_ANLEGEN,
    { refetchQueries: [KAMPAGNEN] },
  );

  const absenden = (event: FormEvent) => {
    event.preventDefault();
    void anlegen({ variables: { input: form } })
      .then((r) => {
        const id = r.data?.kampagneAnlegen.id;

        if (id !== undefined) {
          setForm(LEER);
          navigate(
            verteilerId === null
              ? `/serienmails/${id}`
              : `/serienmails/${id}?verteiler=${encodeURIComponent(verteilerId)}`,
          );
        }
      })
      .catch(() => null);
  };

  const kopf = (
    <ObjectHeader
      hilfe="serienmails"
      kind="mailbox"
      icon={IconMail}
      label="Postfach"
      title="Serienmails"
      note="Ein Text an viele Kontakte, persönlich angesprochen und über Ihr eigenes Postfach verschickt. Jede Mail trägt einen Abmeldelink; wer sich abmeldet, bekommt keine mehr."
      actions={
        error === undefined && (
          <button
            type="button"
            className="button"
            onClick={() => setOffen(!offen)}
          >
            Neue Serienmail
          </button>
        )
      }
    />
  );

  if (error !== undefined) {
    return (
      <>
        {kopf}
        <div className="error-banner">{error.message}</div>
      </>
    );
  }

  return (
    <>
      {kopf}

      {gemerkteAuswahl().length > 0 && (
        <div className="notice">
          {gemerkteAuswahl().length} Kontakte aus der Liste sind vorgemerkt; sie
          werden als Empfänger angeboten.
        </div>
      )}

      {offen && (
        <form className="card serienmail__form" onSubmit={absenden}>
          {angelegt.error !== undefined && (
            <div className="error-banner">{angelegt.error.message}</div>
          )}
          <InhaltFelder form={form} setForm={setForm} />
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={angelegt.loading || form.name.trim() === ''}
            >
              Anlegen und Empfänger wählen
            </button>
          </div>
        </form>
      )}

      {loading && data === undefined ? (
        <LoadingAnnouncement />
      ) : (data?.kampagnen.length ?? 0) === 0 ? (
        <p className="notes__empty">Noch keine Serienmail.</p>
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="numeric">Gesendet</th>
                <th className="numeric">Offen</th>
                <th className="numeric">Übersprungen</th>
                <th className="numeric">Fehler</th>
                <th>Angelegt</th>
              </tr>
            </thead>
            <tbody>
              {data?.kampagnen.map((k) => (
                <tr key={k.id}>
                  <td>
                    <Link to={`/serienmails/${k.id}`}>{k.name}</Link>
                  </td>
                  <td>{STATUS[k.status]}</td>
                  <td className="numeric">{k.gesendet}</td>
                  <td className="numeric">{k.geplant}</td>
                  <td className="numeric">{k.uebersprungen}</td>
                  <td className="numeric">{k.fehler}</td>
                  <td>{ZEIT.format(new Date(k.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Abmeldungen />
    </>
  );
};

type Inhalt = typeof LEER;

const Themenvorschlaege = () => {
  const { data } = useQuery<{ kampagnenThemen: string[] }>(KAMPAGNEN_THEMEN);

  return (
    <datalist id="serie-themen">
      {data?.kampagnenThemen.map((thema) => (
        <option key={thema} value={thema} />
      ))}
    </datalist>
  );
};

type Abmeldung = {
  id: string;
  email: string;
  thema: string;
  zeitpunkt: string;
};

const Abmeldungen = () => {
  const [suche, setSuche] = useState('');
  const { data, loading, error } = useQuery<{ abmeldungen: Abmeldung[] }>(
    ABMELDUNGEN,
    { variables: { suche: suche.trim() === '' ? null : suche.trim() } },
  );
  const liste = data?.abmeldungen ?? [];

  return (
    <section className="detail-section">
      <div className="section-heading">
        <h2>Abmeldungen</h2>
        <input
          type="search"
          className="toolbar__filter"
          aria-label="Abmeldungen durchsuchen"
          placeholder="Adresse suchen…"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {loading && data === undefined ? (
        <LoadingAnnouncement />
      ) : liste.length === 0 ? (
        <p className="notes__empty">
          {suche.trim() === ''
            ? 'Noch hat sich niemand abgemeldet.'
            : 'Keine Abmeldung zu dieser Suche.'}
        </p>
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Adresse</th>
                <th>Thema</th>
                <th>Seit</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td>{a.thema === 'alle' ? 'Alle Serienmails' : a.thema}</td>
                  <td>{ZEIT.format(new Date(a.zeitpunkt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  );
};

const InhaltFelder = ({
  form,
  setForm,
  gesperrt = false,
}: {
  form: Inhalt;
  setForm: (neu: Inhalt) => void;
  gesperrt?: boolean;
}) => (
  <>
    <div className="field">
      <label htmlFor="serie-name">Name (nur intern)</label>
      <input
        id="serie-name"
        required
        maxLength={120}
        disabled={gesperrt}
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
    </div>
    <div className="field">
      <label htmlFor="serie-betreff">Betreff</label>
      <input
        id="serie-betreff"
        maxLength={200}
        disabled={gesperrt}
        value={form.betreff}
        onChange={(event) => setForm({ ...form, betreff: event.target.value })}
      />
    </div>
    <div className="field">
      <label htmlFor="serie-text">Text</label>
      <textarea
        id="serie-text"
        rows={10}
        disabled={gesperrt}
        value={form.text}
        onChange={(event) => setForm({ ...form, text: event.target.value })}
      />
      <p className="field__hint">
        Platzhalter: {'{{vorname}}'}, {'{{nachname}}'}, {'{{firma}}'}; mit
        Ersatz, wo der Wert fehlt: {'{{vorname|zusammen}}'}. Die Abmeldezeile
        wird unten angehängt.
      </p>
    </div>
    <div className="field">
      <label htmlFor="serie-thema">Thema</label>
      <input
        id="serie-thema"
        maxLength={60}
        list="serie-themen"
        disabled={gesperrt}
        value={form.thema}
        onChange={(event) => setForm({ ...form, thema: event.target.value })}
      />
      <Themenvorschlaege />
      <p className="field__hint">
        Wovon sich jemand abmeldet, etwa „Newsletter“ oder „Veranstaltungen“.
        Eine Abmeldung gilt für alle Serienmails mit diesem Thema.
      </p>
    </div>
  </>
);

const Bearbeiten = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, refetch, startPolling, stopPolling } = useQuery<{
    kampagne: Kampagne;
  }>(KAMPAGNE, { variables: { id } });
  const kampagne = data?.kampagne;
  const entwurf = kampagne?.status === 'entwurf';
  const [form, setForm] = useState<Inhalt | null>(null);
  const [suche] = useSearchParams();
  const [quelle, setQuelle] = useState<string>(() => {
    const verteilerId = suche.get('verteiler');

    if (verteilerId !== null && verteilerId !== '') {
      return `verteiler:${verteilerId}`;
    }

    return gemerkteAuswahl().length > 0 ? 'auswahl' : 'alle';
  });
  const { data: verteiler } = useQuery<{ verteilerListe: Verteiler[] }>(
    VERTEILER_LISTE,
  );
  const { data: absender } = useQuery<{
    absenderPruefung: AbsenderPruefung | null;
  }>(ABSENDER_PRUEFUNG);
  const zustellWarnung = serienmailWarnung(absender?.absenderPruefung);
  const { data: ansichten } = useQuery<{
    savedViews: { id: string; name: string }[];
  }>(SAVED_VIEWS, { variables: { entity: 'CONTACT' } });
  const empfaenger = useQuery<{ kampagnenEmpfaenger: Empfaenger[] }>(
    KAMPAGNEN_EMPFAENGER,
    { variables: { id, status: entwurf ? 'uebersprungen' : null } },
  );
  const vorschau = useQuery<{
    kampagnenVorschau: { an: string; betreff: string; text: string };
  }>(KAMPAGNEN_VORSCHAU, { variables: { id }, skip: !entwurf });

  const nachher = {
    refetchQueries: [
      KAMPAGNE,
      KAMPAGNEN,
      KAMPAGNEN_EMPFAENGER,
      KAMPAGNEN_VORSCHAU,
    ],
  };
  const [aendern, geaendert] = useMutation(KAMPAGNE_AENDERN, nachher);
  const [festlegen, festgelegt] = useMutation(
    KAMPAGNEN_EMPFAENGER_FESTLEGEN,
    nachher,
  );
  const [testen, getestet] = useMutation<{ kampagneTestmail: string }>(
    KAMPAGNE_TESTMAIL,
  );
  const [starten, gestartet] = useMutation(KAMPAGNE_STARTEN, nachher);
  const [abbrechen] = useMutation(KAMPAGNE_ABBRECHEN, nachher);
  const [loeschen] = useMutation(KAMPAGNE_LOESCHEN, {
    refetchQueries: [KAMPAGNEN],
  });

  useEffect(() => {
    if (kampagne !== undefined && form === null) {
      setForm({
        name: kampagne.name,
        betreff: kampagne.betreff,
        text: kampagne.text,
        thema: kampagne.thema,
      });
    }
  }, [kampagne, form]);

  useEffect(() => {
    if (kampagne?.status === 'laeuft') {
      startPolling(10_000);
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [kampagne?.status, startPolling, stopPolling]);

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/serienmails', label: 'Zu den Serienmails' }}
      />
    );
  }

  if (kampagne === undefined || form === null) {
    return <LoadingAnnouncement />;
  }

  const fehlerMeldung =
    geaendert.error?.message ??
    festgelegt.error?.message ??
    getestet.error?.message ??
    gestartet.error?.message;
  const gesamt = kampagne.gesendet + kampagne.geplant + kampagne.fehler;
  const auswahl = gemerkteAuswahl();

  const empfaengerUebernehmen = () => {
    const variablen = empfaengerAuswahl(quelle, auswahl);

    void festlegen({ variables: { id, auswahl: variablen } })
      .then(() => {
        if (quelle === 'auswahl') {
          try {
            window.sessionStorage.removeItem(AUSWAHL_SCHLUESSEL);
          } catch {}
        }
      })
      .catch(() => null);
  };

  return (
    <>
      <ObjectHeader
        hilfe="serienmails"
        kind="mailbox"
        icon={IconMail}
        label="Serienmail"
        title={kampagne.name}
        note={STATUS[kampagne.status]}
        actions={
          <Link className="button button--ghost" to="/serienmails">
            Alle Serienmails
          </Link>
        }
      />

      {fehlerMeldung !== undefined && (
        <div className="error-banner">{fehlerMeldung}</div>
      )}

      {kampagne.status !== 'entwurf' && (
        <section className="card serienmail__fortschritt">
          <div className="serienmail__balken" aria-hidden="true">
            <span
              style={{
                width: `${String(gesamt === 0 ? 0 : (kampagne.gesendet / gesamt) * 100)}%`,
              }}
            />
          </div>
          <p>
            {kampagne.gesendet} von {gesamt} gesendet
            {kampagne.fehler > 0 ? `, ${String(kampagne.fehler)} Fehler` : ''}
            {kampagne.uebersprungen > 0
              ? `, ${String(kampagne.uebersprungen)} übersprungen`
              : ''}
            .
            {kampagne.status === 'laeuft' &&
              ' Verschickt wird in kleinen Paketen, höchstens 30 je Minute und 500 am Tag.'}
          </p>
          {kampagne.status === 'laeuft' && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                if (window.confirm('Den Versand abbrechen?')) {
                  void abbrechen({ variables: { id } }).catch(() => null);
                }
              }}
            >
              Versand abbrechen
            </button>
          )}
        </section>
      )}

      <section className="card serienmail__form">
        <h2>Inhalt</h2>
        <InhaltFelder form={form} setForm={setForm} gesperrt={!entwurf} />
        {entwurf && (
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={geaendert.loading}
              onClick={() =>
                void aendern({ variables: { id, input: form } })
                  .then(() => toast.zeige({ text: 'Gespeichert.' }))
                  .catch(() => null)
              }
            >
              Speichern
            </button>
          </div>
        )}
      </section>

      {entwurf && zustellWarnung !== null && (
        <div className="notice serienmail__zustellung" role="status">
          {zustellWarnung} <Link to="/postfach">Zum Postfach</Link>
        </div>
      )}

      {entwurf && (
        <section className="card serienmail__form">
          <h2>Empfänger</h2>
          <div className="field">
            <label htmlFor="serie-quelle">Wer bekommt sie?</label>
            <select
              id="serie-quelle"
              value={quelle}
              onChange={(event) => setQuelle(event.target.value)}
            >
              {auswahl.length > 0 && (
                <option value="auswahl">
                  Ausgewählte Kontakte ({auswahl.length})
                </option>
              )}
              <option value="alle">Alle Kontakte</option>
              {(verteiler?.verteilerListe ?? []).map((liste) => (
                <option key={liste.id} value={`verteiler:${liste.id}`}>
                  Verteiler „{liste.name}“ ({liste.anzahl})
                </option>
              ))}
              {(ansichten?.savedViews ?? []).map((ansicht) => (
                <option key={ansicht.id} value={ansicht.id}>
                  Ansicht „{ansicht.name}“
                </option>
              ))}
            </select>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={festgelegt.loading}
              onClick={empfaengerUebernehmen}
            >
              Empfänger übernehmen
            </button>
          </div>
          <p>
            <strong>{kampagne.geplant}</strong> bekommen die Mail,{' '}
            <strong>{kampagne.uebersprungen}</strong> werden übersprungen.
          </p>
        </section>
      )}

      {(empfaenger.data?.kampagnenEmpfaenger.length ?? 0) > 0 && (
        <section className="detail-section">
          <h2>{entwurf ? 'Übersprungen, mit Grund' : 'Empfänger'}</h2>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Status</th>
                  <th>Grund</th>
                </tr>
              </thead>
              <tbody>
                {empfaenger.data?.kampagnenEmpfaenger.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.contactId === null ? (
                        `${e.vorname} ${e.nachname}`
                      ) : (
                        <Link to={`/kontakte/${e.contactId}`}>
                          {e.vorname} {e.nachname}
                        </Link>
                      )}
                    </td>
                    <td>{e.email ?? '—'}</td>
                    <td>{EMPFAENGER_STATUS[e.status] ?? e.status}</td>
                    <td>{e.grund ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </section>
      )}

      {entwurf && vorschau.data !== undefined && (
        <section className="card serienmail__form">
          <h2>Vorschau</h2>
          <p className="field__hint">
            So sieht es für {vorschau.data.kampagnenVorschau.an} aus.
          </p>
          <p>
            <strong>{vorschau.data.kampagnenVorschau.betreff}</strong>
          </p>
          <pre className="serienmail__vorschau">
            {vorschau.data.kampagnenVorschau.text}
          </pre>
          <div className="row-actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={getestet.loading}
              onClick={() =>
                void testen({ variables: { id } })
                  .then((r) =>
                    toast.zeige({
                      text: `Testmail an ${r.data?.kampagneTestmail ?? 'Sie'} verschickt.`,
                    }),
                  )
                  .catch(() => null)
              }
            >
              Testmail an mich
            </button>
            <button
              type="button"
              className="button"
              disabled={gestartet.loading || kampagne.geplant === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `Die Serienmail an ${String(kampagne.geplant)} Empfänger verschicken?`,
                  )
                ) {
                  void starten({ variables: { id } })
                    .then(() => refetch())
                    .catch(() => null);
                }
              }}
            >
              An {kampagne.geplant} Empfänger verschicken
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                if (window.confirm('Diesen Entwurf löschen?')) {
                  void loeschen({ variables: { id } })
                    .then(() => navigate('/serienmails'))
                    .catch(() => null);
                }
              }}
            >
              Löschen
            </button>
          </div>
        </section>
      )}
    </>
  );
};

export const SerienmailsPage = () => {
  const { id } = useParams();

  return id === undefined ? <Liste /> : <Bearbeiten id={id} />;
};
