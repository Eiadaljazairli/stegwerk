import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import {
  ANKUENDIGUNG_BEENDEN,
  ANKUENDIGUNG_SETZEN,
  BETRIEBS_HINWEIS,
  BETRIEBS_ZUSTAND,
} from '../lib/queries';
import { type Sicherung, sicherungKurz } from '../lib/sicherungText';
import { BetriebSicherung } from './BetriebSicherung';
import { TableWrap } from './TableWrap';

type Lauf = {
  name: string;
  zustand: string;
  intervallSek: number;
  letzterStart: string | null;
  letzterErfolg: string | null;
  letzterFehlerAm: string | null;
  letzterFehler: string | null;
  letzteDauerMs: number | null;
  laeufe: number;
  fehlerInFolge: number;
};

type Zustand = {
  version: string;
  gestartetAm: string;
  datenbankOk: boolean;
  datenbankMs: number;
  offeneMigrationen: string[];
  mailVersand: string;
  postfaecher: number;
  postfaecherMitFehler: number;
  kalender: number;
  kalenderMitFehler: number;
  oauthWiderrufen: number;
  speicherFreiBytes: number | null;
  speicherGesamtBytes: number | null;
  protokollAenderungenMonate: number;
  protokollSicherheitMonate: number;
  sicherung: Sicherung;
  laeufe: Lauf[];
};

type Ankuendigung = {
  id: string;
  text: string;
  von: string;
  bis: string;
  wartung: boolean;
  createdAt: string;
};

const LAUF_NAME: Record<string, string> = {
  'aufbewahrung-bereiche': 'Bereiche nach Ablauf löschen',
  'aufgaben-erinnerung': 'Aufgaben-Erinnerung',
  'automationen-faellige': 'Automationen: fällige',
  'automationen-ruhende': 'Automationen: ruhende Geschäfte',
  buchhaltung: 'Belege an die Buchhaltung',
  'kalender-abgleich': 'Kalender-Abgleich',
  papierkorb: 'Papierkorb leeren',
  'postfach-abruf': 'Postfächer abholen',
  'protokolle-aufraeumen': 'Protokolle aufräumen',
  serienmails: 'Serienmails verschicken',
  serienrechnungen: 'Serienrechnungen',
  'termin-erinnerung': 'Termin-Erinnerung',
  'testphase-hinweis': 'Hinweis Testphase endet',
  'verlaengerung-hinweis': 'Hinweis Jahresabo verlängert sich',
};

const ZUSTAND: Record<string, { text: string; klasse: string }> = {
  ok: { text: 'läuft', klasse: 'badge--positive' },
  wartet: { text: 'noch nicht gelaufen', klasse: '' },
  laeuft: { text: 'läuft gerade', klasse: '' },
  fehler: { text: 'Fehler', klasse: 'badge--lost' },
  ausgeblieben: { text: 'ausgeblieben', klasse: 'badge--lost' },
  aus: { text: 'abgeschaltet', klasse: '' },
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const zeit = (iso: string | null) =>
  iso === null ? '—' : ZEIT.format(new Date(iso));

const intervall = (sek: number) =>
  sek >= 86_400
    ? `${String(Math.round(sek / 86_400))} Tag(e)`
    : sek >= 3600
      ? `${String(Math.round(sek / 3600))} Std.`
      : `${String(Math.round(sek / 60))} Min.`;

const gb = (bytes: number) =>
  `${(bytes / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;

const eingabeZeit = (datum: Date) => {
  const ort = new Date(datum.getTime() - datum.getTimezoneOffset() * 60_000);

  return ort.toISOString().slice(0, 16);
};

export const BetriebSystem = () => {
  const { data, error, refetch } = useQuery<{
    betriebsZustand: Zustand;
    ankuendigungen: Ankuendigung[];
  }>(BETRIEBS_ZUSTAND, { fetchPolicy: 'cache-and-network' });
  const nachher = {
    refetchQueries: [{ query: BETRIEBS_ZUSTAND }, { query: BETRIEBS_HINWEIS }],
  };
  const [setzen, gesetzt] = useMutation(ANKUENDIGUNG_SETZEN, nachher);
  const [beenden] = useMutation(ANKUENDIGUNG_BEENDEN, nachher);

  const jetzt = new Date();
  const [form, setForm] = useState({
    text: '',
    von: eingabeZeit(jetzt),
    bis: eingabeZeit(new Date(jetzt.getTime() + 60 * 60 * 1000)),
    wartung: false,
  });

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (data === undefined) {
    return null;
  }

  const z = data.betriebsZustand;
  const probleme = z.laeufe.filter(
    (lauf) => lauf.zustand === 'fehler' || lauf.zustand === 'ausgeblieben',
  ).length;

  const absenden = (event: FormEvent) => {
    event.preventDefault();
    void setzen({
      variables: {
        input: {
          text: form.text,
          von: new Date(form.von).toISOString(),
          bis: new Date(form.bis).toISOString(),
          wartung: form.wartung,
        },
      },
    })
      .then(() => setForm({ ...form, text: '' }))
      .catch(() => null);
  };

  return (
    <>
      <section className="detail-section">
        <div className="section-heading">
          <h2>Systemzustand</h2>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void refetch()}
          >
            Aktualisieren
          </button>
        </div>

        <div className="metrics betrieb-zahlen">
          <div className="card metric">
            <div className="metric__label">Datenbank</div>
            <div className="metric__value">
              {z.datenbankOk ? `ok · ${String(z.datenbankMs)} ms` : 'Fehler'}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Migrationen</div>
            <div className="metric__value">
              {z.offeneMigrationen.length === 0
                ? 'aktuell'
                : `${String(z.offeneMigrationen.length)} offen`}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Mailversand</div>
            <div className="metric__value">
              {z.mailVersand === 'smtp' ? 'SMTP' : 'nur Datei'}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Geplante Läufe</div>
            <div className="metric__value">
              {probleme === 0 ? 'ok' : `${String(probleme)} mit Problem`}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Postfächer mit Fehler</div>
            <div className="metric__value">
              {z.postfaecherMitFehler} / {z.postfaecher}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Kalender mit Fehler</div>
            <div className="metric__value">
              {z.kalenderMitFehler} / {z.kalender}
            </div>
          </div>
          <div className="card metric">
            <div className="metric__label">Google/Microsoft neu verbinden</div>
            <div className="metric__value">{z.oauthWiderrufen}</div>
          </div>
          <div
            className={
              z.sicherung.warnungen.length > 0
                ? 'card metric is-alarming'
                : 'card metric'
            }
          >
            <div className="metric__label">Sicherung</div>
            <div className="metric__value">{sicherungKurz(z.sicherung)}</div>
          </div>
          <div className="card metric">
            <div className="metric__label">Freier Speicher</div>
            <div className="metric__value">
              {z.speicherFreiBytes === null || z.speicherGesamtBytes === null
                ? '—'
                : `${gb(z.speicherFreiBytes)} von ${gb(z.speicherGesamtBytes)}`}
            </div>
          </div>
        </div>

        <p className="field__hint">
          Fassung {z.version}, gestartet {zeit(z.gestartetAm)}. Protokolle:
          Änderungen {z.protokollAenderungenMonate} Monate, Sicherheit{' '}
          {z.protokollSicherheitMonate} Monate.
          {z.offeneMigrationen.length > 0 &&
            ` Offen: ${z.offeneMigrationen.join(', ')}.`}
        </p>

        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Lauf</th>
                <th>Zustand</th>
                <th>Alle</th>
                <th>Zuletzt</th>
                <th>Zuletzt erfolgreich</th>
                <th className="numeric">Dauer</th>
                <th>Letzter Fehler</th>
              </tr>
            </thead>
            <tbody>
              {z.laeufe.map((lauf) => {
                const zustand = ZUSTAND[lauf.zustand] ?? {
                  text: lauf.zustand,
                  klasse: '',
                };

                return (
                  <tr key={lauf.name}>
                    <td>{LAUF_NAME[lauf.name] ?? lauf.name}</td>
                    <td>
                      <span className={`badge ${zustand.klasse}`}>
                        {zustand.text}
                      </span>
                      {lauf.fehlerInFolge > 1 &&
                        ` (${String(lauf.fehlerInFolge)}× in Folge)`}
                    </td>
                    <td>{intervall(lauf.intervallSek)}</td>
                    <td>{zeit(lauf.letzterStart)}</td>
                    <td>{zeit(lauf.letzterErfolg)}</td>
                    <td className="numeric">
                      {lauf.letzteDauerMs === null
                        ? '—'
                        : `${(lauf.letzteDauerMs / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`}
                    </td>
                    <td className="betrieb-fehler">
                      {lauf.letzterFehler === null
                        ? '—'
                        : `${zeit(lauf.letzterFehlerAm)}: ${lauf.letzterFehler}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <BetriebSicherung sicherung={z.sicherung} />

      <section className="detail-section">
        <h2>Ankündigung an alle</h2>
        <p className="field__hint">
          Erscheint oben bei allen Angemeldeten. Mit „Wartung“ nimmt Stegwerk in
          diesem Zeitraum keine Änderungen an (Lesen, Anmelden und öffentliche
          Formulare gehen weiter; Sie selbst sind ausgenommen).
        </p>

        <form className="card betrieb-ankuendigung" onSubmit={absenden}>
          {gesetzt.error !== undefined && (
            <div className="error-banner">{gesetzt.error.message}</div>
          )}
          <div className="field">
            <label htmlFor="ankuendigung-text">Text</label>
            <input
              id="ankuendigung-text"
              maxLength={500}
              placeholder="Am Donnerstag ab 22 Uhr ist Stegwerk etwa 30 Minuten nicht erreichbar."
              value={form.text}
              onChange={(event) =>
                setForm({ ...form, text: event.target.value })
              }
            />
          </div>
          <div className="betrieb-ankuendigung__zeit">
            <div className="field">
              <label htmlFor="ankuendigung-von">Von</label>
              <input
                id="ankuendigung-von"
                type="datetime-local"
                value={form.von}
                onChange={(event) =>
                  setForm({ ...form, von: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="ankuendigung-bis">Bis</label>
              <input
                id="ankuendigung-bis"
                type="datetime-local"
                value={form.bis}
                onChange={(event) =>
                  setForm({ ...form, bis: event.target.value })
                }
              />
            </div>
            <label className="betrieb-ankuendigung__wartung">
              <input
                type="checkbox"
                checked={form.wartung}
                onChange={(event) =>
                  setForm({ ...form, wartung: event.target.checked })
                }
              />
              Wartung: Änderungen sperren
            </label>
          </div>
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={gesetzt.loading || form.text.trim() === ''}
            >
              Ankündigen
            </button>
          </div>
        </form>

        {data.ankuendigungen.length > 0 && (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Text</th>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Art</th>
                  <th>
                    <span className="visually-hidden">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.ankuendigungen.map((a) => (
                  <tr key={a.id}>
                    <td>{a.text}</td>
                    <td>{zeit(a.von)}</td>
                    <td>{zeit(a.bis)}</td>
                    <td>{a.wartung ? 'Wartung' : 'Hinweis'}</td>
                    <td>
                      {new Date(a.bis) > new Date() && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() =>
                            void beenden({ variables: { id: a.id } }).catch(
                              () => null,
                            )
                          }
                        >
                          Beenden
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
};
