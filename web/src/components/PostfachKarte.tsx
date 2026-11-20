import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

import { mitgliederUmschalten, postfachName } from '../lib/postfaecher';
import {
  DISCONNECT_MAILBOX,
  SET_HAUPTPOSTFACH,
  SET_MAIL_SICHTBARKEIT,
  SET_POSTFACH_EINSTELLUNGEN,
  SET_POSTFACH_MITGLIEDER,
  SYNC_MAILBOX,
} from '../lib/queries';
import { type Mailbox, type MailboxSyncResult } from '../lib/types';
import { AbhilfeLink } from './AbhilfeLink';
import { anbieterName, OAuthKnoepfe } from './OAuthAnmeldung';
import { personName, useTeam } from './Verantwortlich';

const SICHTBARKEIT: Record<
  Mailbox['art'],
  Record<Mailbox['sichtbarkeit'], string>
> = {
  persoenlich: {
    alles: 'Alles: Betreff, Beteiligte und Text',
    kopf: 'Nur Betreff und Beteiligte, der Text bleibt bei mir',
    privat: 'Privat: nur ich',
  },
  gemeinsam: {
    alles: 'Alle im Team: Betreff, Beteiligte und Text',
    kopf: 'Alle im Team: nur Betreff und Beteiligte',
    privat: 'Nur die Mitglieder dieses Postfachs',
  },
};

const zeitpunkt = (wert: string | null): string =>
  wert === null
    ? 'noch nie'
    : new Date(wert).toLocaleString('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

export const syncMeldung = (ergebnis: MailboxSyncResult): string => {
  if (ergebnis.stored === 0) {
    return 'Nichts Neues gefunden.';
  }

  const zugeordnet = `${String(ergebnis.matched)} zugeordnet`;
  const offen =
    ergebnis.unfiled === 0
      ? ''
      : `, ${String(ergebnis.unfiled)} ohne passenden Datensatz`;

  return `${String(ergebnis.stored)} neue Nachrichten gelesen: ${zugeordnet}${offen}.`;
};

export const PostfachKarte = ({
  mailbox,
  geaendert,
}: {
  mailbox: Mailbox;
  geaendert: () => Promise<unknown>;
}): JSX.Element => {
  const [disconnect] = useMutation(DISCONNECT_MAILBOX);
  const [sichtbarkeitSetzen] = useMutation(SET_MAIL_SICHTBARKEIT);
  const [hauptSetzen, { loading: hauptLaeuft }] =
    useMutation(SET_HAUPTPOSTFACH);
  const [sync, { loading: syncing }] = useMutation<{
    syncMailbox: MailboxSyncResult;
  }>(SYNC_MAILBOX);
  const [trennenFrage, setTrennenFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<MailboxSyncResult | null>(null);
  const darfVerwalten = mailbox.darfVerwalten !== false;
  const gemeinsam = mailbox.art === 'gemeinsam';
  const kennung = `postfach-${mailbox.id}`;
  const { session } = useAuth();
  const ich = session?.user.id ?? null;

  const versuche = async (schritt: () => Promise<unknown>): Promise<void> => {
    setFehler(null);

    try {
      await schritt();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  const abrufen = async (): Promise<void> => {
    setErgebnis(null);
    await versuche(async () => {
      const antwort = await sync({ variables: { mailboxId: mailbox.id } });
      setErgebnis(antwort.data?.syncMailbox ?? null);
    });
    await geaendert();
  };

  const trennen = async (behalten: boolean): Promise<void> => {
    await versuche(() =>
      disconnect({ variables: { behalten, mailboxId: mailbox.id } }),
    );
    setTrennenFrage(false);
    await geaendert();
  };

  return (
    <section className="card postfach-karte" aria-labelledby={kennung}>
      <div className="postfach-karte__kopf">
        <h2 id={kennung}>{postfachName(mailbox)}</h2>
        <span className="postfach-karte__art">
          {gemeinsam
            ? 'Gemeinsames Postfach'
            : mailbox.haupt
              ? 'Hauptpostfach'
              : 'Weiteres eigenes Postfach'}
        </span>
      </div>
      <p className="page__subtitle">
        {mailbox.oauthAnbieter !== null &&
          `Angemeldet über ${anbieterName(mailbox.oauthAnbieter)} · `}
        {mailbox.host} · Port {mailbox.port} · Ordner {mailbox.folder} ·{' '}
        {mailbox.secure ? 'SSL' : 'STARTTLS'}
      </p>
      {mailbox.gesendetOrdner !== null && (
        <p className="page__subtitle">
          Liest auch den Ordner {mailbox.gesendetOrdner}
        </p>
      )}
      <p className="page__subtitle">
        {mailbox.smtpHost === null || mailbox.smtpHost === ''
          ? 'Wird nur gelesen — kein Postausgang eingetragen.'
          : `Postausgang ${mailbox.smtpHost} · Port ${String(mailbox.smtpPort ?? 587)}`}
      </p>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
          <AbhilfeLink meldung={fehler} />
        </div>
      )}

      {mailbox.getrennt === true ? (
        <p className="banner banner--warning" role="status">
          Getrennt; die gelesene Post ist geblieben. Verbinden Sie dasselbe
          Konto neu, liest Stegwerk dort weiter, wo es aufhörte.
        </p>
      ) : (
        <dl className="mailbox__facts">
          <div>
            <dt>Zuletzt abgerufen</dt>
            <dd>
              {zeitpunkt(mailbox.lastSyncedAt)}
              <span className="field__hint">
                {' '}
                · automatisch alle 10 Minuten
              </span>
            </dd>
          </div>
          <div>
            <dt>Gelesene Nachrichten</dt>
            <dd>{mailbox.messageCount}</dd>
          </div>
        </dl>
      )}

      {mailbox.lastError !== null && (
        <div className="banner banner--warning" role="status">
          {mailbox.lastError}
          <AbhilfeLink meldung={mailbox.lastError} />
        </div>
      )}
      {mailbox.lastError !== null &&
        mailbox.oauthAnbieter !== null &&
        darfVerwalten && (
          <OAuthKnoepfe
            zweck="postfach"
            text="neu verbinden"
            {...(mailbox.haupt
              ? {}
              : {
                  postfachArt: gemeinsam
                    ? ('gemeinsam' as const)
                    : ('weiteres' as const),
                })}
          />
        )}

      {ergebnis !== null && (
        <div className="notice notice--positive" role="status">
          {syncMeldung(ergebnis)}
        </div>
      )}

      <div className="row-actions">
        {mailbox.getrennt !== true && (
          <button
            type="button"
            className="button"
            onClick={() => void abrufen()}
            disabled={syncing}
          >
            {syncing ? 'Wird abgerufen…' : 'Jetzt abrufen'}
          </button>
        )}
        {(!gemeinsam || (mailbox.mitglieder ?? []).includes(ich ?? '')) && (
          <Link className="button button--ghost" to={`/postfach/${mailbox.id}`}>
            Posteingang öffnen
          </Link>
        )}
        {!gemeinsam && !mailbox.haupt && mailbox.getrennt !== true && (
          <button
            type="button"
            className="button button--ghost"
            disabled={hauptLaeuft}
            onClick={() =>
              void versuche(async () => {
                await hauptSetzen({ variables: { mailboxId: mailbox.id } });
                await geaendert();
              })
            }
          >
            Zum Hauptpostfach machen
          </button>
        )}
      </div>

      {darfVerwalten && (
        <>
          {mailbox.getrennt !== true && <Bezeichnung mailbox={mailbox} />}

          <div className="field">
            <label htmlFor={`${kennung}-sichtbarkeit`}>
              {gemeinsam
                ? 'Wer die Post dieses Postfachs in den Akten sieht'
                : 'Wer im Team Ihre Post sieht'}
            </label>
            <select
              id={`${kennung}-sichtbarkeit`}
              value={mailbox.sichtbarkeit}
              onChange={(event) =>
                void versuche(async () => {
                  await sichtbarkeitSetzen({
                    variables: {
                      sichtbarkeit: event.target.value,
                      mailboxId: mailbox.id,
                    },
                  });
                  await geaendert();
                })
              }
            >
              {(
                Object.keys(
                  SICHTBARKEIT[mailbox.art],
                ) as Mailbox['sichtbarkeit'][]
              ).map((wert) => (
                <option key={wert} value={wert}>
                  {SICHTBARKEIT[mailbox.art][wert]}
                </option>
              ))}
            </select>
            <p className="field__hint">
              Gilt für alles, was aus diesem Postfach gelesen wurde, auch
              rückwirkend.
            </p>
          </div>

          {gemeinsam && (
            <Mitglieder
              mailbox={mailbox}
              geaendert={geaendert}
              kennung={kennung}
            />
          )}

          {trennenFrage ? (
            <div className="mailbox__trennen" role="group" aria-label="Trennen">
              <p>
                Was soll mit den {mailbox.messageCount} gelesenen Nachrichten
                geschehen? Die Zugangsdaten werden in beiden Fällen gelöscht.
              </p>
              <div className="row-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void trennen(true)}
                >
                  Trennen, Nachrichten behalten
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => void trennen(false)}
                >
                  Trennen und Nachrichten löschen
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setTrennenFrage(false)}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="button button--danger"
              onClick={() => setTrennenFrage(true)}
            >
              Postfach trennen
            </button>
          )}
        </>
      )}
    </section>
  );
};

const Bezeichnung = ({ mailbox }: { mailbox: Mailbox }): JSX.Element => {
  const [wert, setWert] = useState(mailbox.bezeichnung ?? '');
  const [setzen, { loading }] = useMutation(SET_POSTFACH_EINSTELLUNGEN);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const kennung = `postfach-${mailbox.id}-bezeichnung`;

  const speichern = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setGespeichert(false);
    setFehler(null);

    try {
      await setzen({
        variables: {
          input: { bezeichnung: wert.trim() },
          mailboxId: mailbox.id,
        },
      });
      setGespeichert(true);
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Nicht gespeichert.',
      );
    }
  };

  return (
    <form className="field" onSubmit={(event) => void speichern(event)}>
      <label htmlFor={kennung}>Bezeichnung</label>
      <div className="postfach-karte__zeile">
        <input
          id={kennung}
          value={wert}
          maxLength={100}
          placeholder={mailbox.username}
          onChange={(event) => {
            setWert(event.target.value);
            setGespeichert(false);
          }}
        />
        <button
          type="submit"
          className="button button--ghost"
          disabled={loading}
        >
          Speichern
        </button>
      </div>
      {gespeichert && (
        <p className="field__hint" role="status">
          Gespeichert.
        </p>
      )}
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
    </form>
  );
};

const Mitglieder = ({
  mailbox,
  geaendert,
  kennung,
}: {
  mailbox: Mailbox;
  geaendert: () => Promise<unknown>;
  kennung: string;
}): JSX.Element => {
  const team = useTeam();
  const [auswahl, setAuswahl] = useState<string[]>(mailbox.mitglieder ?? []);
  const [setzen, { loading }] = useMutation(SET_POSTFACH_MITGLIEDER);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const unveraendert =
    [...auswahl].sort().join() ===
    [...(mailbox.mitglieder ?? [])].sort().join();

  const speichern = async (): Promise<void> => {
    setFehler(null);
    setMeldung(null);

    try {
      await setzen({
        variables: { mailboxId: mailbox.id, userIds: auswahl },
      });
      setMeldung('Mitglieder gespeichert.');
      await geaendert();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Nicht gespeichert.',
      );
    }
  };

  return (
    <fieldset className="postfach-mitglieder">
      <legend>Mitglieder: lesen, antworten, Gespräche übernehmen</legend>
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      <ul>
        {team.map((person) => (
          <li key={person.id}>
            <label>
              <input
                type="checkbox"
                checked={auswahl.includes(person.id)}
                onChange={() =>
                  setAuswahl(mitgliederUmschalten(auswahl, person.id))
                }
              />
              <span>{personName(person)}</span>
            </label>
          </li>
        ))}
      </ul>
      {auswahl.length === 0 && (
        <p className="field__hint" id={`${kennung}-niemand`}>
          Ohne Mitglieder liest das Postfach niemand; abgerufen wird es
          trotzdem.
        </p>
      )}
      <div className="row-actions">
        <button
          type="button"
          className="button"
          disabled={loading || unveraendert}
          onClick={() => void speichern()}
        >
          Mitglieder speichern
        </button>
        {meldung !== null && (
          <span className="field__hint" role="status">
            {meldung}
          </span>
        )}
      </div>
    </fieldset>
  );
};
