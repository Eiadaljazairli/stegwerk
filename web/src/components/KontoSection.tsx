import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useEffect, useState } from 'react';

import { useToast } from './Toast';
import { SsoZeichen } from './SsoKnoepfe';
import { useAuth } from '../lib/auth';
import {
  ANMELDE_ANBIETER,
  ANMELDE_VERKNUEPFUNGEN,
  ANMELDUNG_TRENNEN,
  ANMELDUNG_VERKNUEPFEN_STARTEN,
  EINLADUNGS_DOMAINS,
  EMAIL_AENDERN_ANFRAGEN,
  KONTO_LOESCHEN,
  LEERLAUF,
  MY_WORKSPACES,
  PASSWORT_AENDERN,
  PASSWORT_LINK_SENDEN,
  PROFIL,
  PROFIL_AENDERN,
  SET_EINLADUNGS_DOMAINS,
  SET_LEERLAUF,
  SET_ZWEI_FAKTOR_PFLICHT,
  TWO_FACTOR_STATUS,
} from '../lib/queries';
import {
  domainsAlsText,
  domainsAusText,
  eigeneDomainFehlt,
} from '../lib/einladungsDomains';
import { LEERLAUF_STUFEN } from '../lib/leerlauf';
import {
  darfTrennen,
  ohneSsoParameter,
  sichtbareAnbieter,
  type SsoAnbieter,
  ssoName,
  ssoRueckmeldung,
} from '../lib/sso';
import { type WorkspaceMembership } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';

type Profil = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  funktion: string | null;
  durchwahl: string | null;
  mailSignatur: string | null;
  passwortGesetzt: boolean;
  emailVerifiedAt: string | null;
};

const PasswortFestlegen = ({ email }: { email: string }) => {
  const [senden, { loading, error, data }] = useMutation<{
    passwortLinkSenden: boolean;
  }>(PASSWORT_LINK_SENDEN);

  return (
    <>
      <h3>Passwort festlegen</h3>
      <p className="field__hint">
        Sie melden sich bisher nur mit Google oder Microsoft an. Mit einem
        eigenen Passwort kommen Sie auch ohne diese hinein, und Sie brauchen es,
        um die Anmelde-Adresse zu ändern oder das Konto zu löschen.
      </p>
      {error !== undefined && (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      )}
      {data?.passwortLinkSenden === true ? (
        <p role="status">
          Ein Link ist an <strong>{email}</strong> unterwegs. Danach melden Sie
          sich einmal neu an.
        </p>
      ) : (
        <div className="row-actions">
          <button
            type="button"
            className="button"
            disabled={loading}
            onClick={() => void senden().catch(() => null)}
          >
            Link zum Festlegen senden
          </button>
        </div>
      )}
    </>
  );
};

export const KontoSection = () => {
  const toast = useToast();
  const { data } = useQuery<{ me: Profil }>(PROFIL);
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [funktion, setFunktion] = useState('');
  const [durchwahl, setDurchwahl] = useState('');
  const [signatur, setSignatur] = useState('');
  const [aktuell, setAktuell] = useState('');
  const [neu, setNeu] = useState('');
  const [wiederholt, setWiederholt] = useState('');
  const [hinweis, setHinweis] = useState<string | null>(null);

  useEffect(() => {
    if (data !== undefined) {
      setVorname(data.me.firstName);
      setNachname(data.me.lastName);
      setFunktion(data.me.funktion ?? '');
      setDurchwahl(data.me.durchwahl ?? '');
      setSignatur(data.me.mailSignatur ?? '');
    }
  }, [data]);

  const [profilSpeichern, profil] = useMutation(PROFIL_AENDERN);
  const [passwortSpeichern, passwort] = useMutation(PASSWORT_AENDERN);

  const nameAendern = (event: FormEvent) => {
    event.preventDefault();
    void profilSpeichern({
      variables: {
        input: {
          firstName: vorname.trim(),
          lastName: nachname.trim(),
          funktion,
          durchwahl,
          mailSignatur: signatur,
        },
      },
    })
      .then(() => toast.zeige({ text: 'Profil gespeichert.' }))
      .catch(() => null);
  };

  const passwortAendern = (event: FormEvent) => {
    event.preventDefault();
    setHinweis(null);

    if (neu !== wiederholt) {
      setHinweis('Die beiden neuen Passwörter stimmen nicht überein.');

      return;
    }

    void passwortSpeichern({ variables: { input: { aktuell, neu } } })
      .then(() => {
        setAktuell('');
        setNeu('');
        setWiederholt('');
        toast.zeige({
          text: 'Passwort geändert. Alle anderen Anmeldungen wurden beendet.',
        });
      })
      .catch(() => null);
  };

  const geaendert =
    data !== undefined &&
    (vorname.trim() !== data.me.firstName ||
      nachname.trim() !== data.me.lastName ||
      funktion.trim() !== (data.me.funktion ?? '') ||
      durchwahl.trim() !== (data.me.durchwahl ?? '') ||
      signatur.trim() !== (data.me.mailSignatur ?? ''));

  return (
    <section className="card konto">
      <h2>Mein Konto</h2>
      {data !== undefined && (
        <p className="field__hint">Angemeldet als {data.me.email}</p>
      )}

      <form className="konto__form" onSubmit={nameAendern}>
        <div className="field">
          <label htmlFor="konto-vorname">Vorname</label>
          <input
            id="konto-vorname"
            required
            maxLength={100}
            autoComplete="given-name"
            value={vorname}
            onChange={(event) => setVorname(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="konto-nachname">Nachname</label>
          <input
            id="konto-nachname"
            required
            maxLength={100}
            autoComplete="family-name"
            value={nachname}
            onChange={(event) => setNachname(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="konto-funktion">Funktion</label>
          <input
            id="konto-funktion"
            maxLength={100}
            autoComplete="organization-title"
            placeholder="z. B. Vertrieb Süd"
            value={funktion}
            onChange={(event) => setFunktion(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="konto-durchwahl">Telefon / Durchwahl</label>
          <input
            id="konto-durchwahl"
            type="tel"
            maxLength={50}
            autoComplete="tel"
            value={durchwahl}
            onChange={(event) => setDurchwahl(event.target.value)}
          />
          <p className="field__hint">
            Steht mit Ihrem Namen als „Ihr Ansprechpartner“ auf den Angeboten,
            die Sie anlegen.
          </p>
        </div>
        <div className="field konto__signatur">
          <label htmlFor="konto-signatur">E-Mail-Signatur</label>
          <textarea
            id="konto-signatur"
            rows={5}
            maxLength={2000}
            value={signatur}
            onChange={(event) => setSignatur(event.target.value)}
          />
          <p className="field__hint">
            Steht unter jeder neuen Mail aus der Akte; vor dem Senden lässt sie
            sich ändern.
          </p>
        </div>
        {profil.error !== undefined && (
          <div className="error-banner">{profil.error.message}</div>
        )}
        <div className="row-actions">
          <button
            type="submit"
            className="button"
            disabled={!geaendert || profil.loading}
          >
            Profil speichern
          </button>
        </div>
      </form>

      {data !== undefined && !data.me.passwortGesetzt ? (
        <PasswortFestlegen email={data.me.email} />
      ) : (
        <>
          <h3>Passwort ändern</h3>
          <form className="konto__form" onSubmit={passwortAendern}>
            <div className="field">
              <label htmlFor="konto-aktuell">Bisheriges Passwort</label>
              <input
                id="konto-aktuell"
                type="password"
                required
                autoComplete="current-password"
                value={aktuell}
                onChange={(event) => setAktuell(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="konto-neu">Neues Passwort</label>
              <input
                id="konto-neu"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={neu}
                onChange={(event) => setNeu(event.target.value)}
              />
              <p className="field__hint">Mindestens 12 Zeichen.</p>
            </div>
            <div className="field">
              <label htmlFor="konto-wiederholt">
                Neues Passwort wiederholen
              </label>
              <input
                id="konto-wiederholt"
                type="password"
                required
                autoComplete="new-password"
                value={wiederholt}
                onChange={(event) => setWiederholt(event.target.value)}
              />
            </div>
            {(hinweis ?? passwort.error?.message) !== undefined &&
              (hinweis ?? passwort.error?.message) !== null && (
                <div className="error-banner" role="alert">
                  {hinweis ?? passwort.error?.message}
                </div>
              )}
            <div className="row-actions">
              <button
                type="submit"
                className="button"
                disabled={passwort.loading || aktuell === '' || neu.length < 12}
              >
                Passwort ändern
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
};

type Verknuepfung = {
  anbieter: string;
  email: string | null;
  zuletztAm: string | null;
  createdAt: string;
};

const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export const AnmeldemethodenSection = () => {
  const toast = useToast();
  const { data: anbieterDaten } = useQuery<{ anmeldeAnbieter: string[] }>(
    ANMELDE_ANBIETER,
  );
  const { data: profil } = useQuery<{ me: Profil }>(PROFIL);
  const { data, refetch } = useQuery<{
    anmeldeVerknuepfungen: Verknuepfung[];
  }>(ANMELDE_VERKNUEPFUNGEN);
  const [starten, start] = useMutation<{ anmeldungVerknuepfenStarten: string }>(
    ANMELDUNG_VERKNUEPFEN_STARTEN,
  );
  const [trennen, trennung] = useMutation(ANMELDUNG_TRENNEN);
  const [waehlt, setWaehlt] = useState<SsoAnbieter | null>(null);
  const [passwort, setPasswort] = useState('');
  const [rueckmeldung] = useState(() =>
    ssoRueckmeldung(window.location.search),
  );

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const rest = ohneSsoParameter(search);

    if (rest !== search) {
      window.history.replaceState(
        window.history.state,
        '',
        `${pathname}${rest}${hash}`,
      );
    }
  }, []);

  const anbieter = sichtbareAnbieter(anbieterDaten?.anmeldeAnbieter);

  if (anbieter.length === 0 || profil === undefined) {
    return null;
  }

  const verknuepfungen = data?.anmeldeVerknuepfungen ?? [];
  const mitPasswort = profil.me.passwortGesetzt;
  const bestaetigt = profil.me.emailVerifiedAt !== null;
  const trennenErlaubt = darfTrennen(verknuepfungen.length, mitPasswort);
  const fehler = start.error ?? trennung.error;

  const verknuepfen = (welcher: SsoAnbieter) =>
    void starten({
      variables: {
        anbieter: welcher,
        passwort: mitPasswort ? passwort : null,
      },
    })
      .then((antwort) => {
        const url = antwort.data?.anmeldungVerknuepfenStarten;

        if (url !== undefined) {
          window.location.assign(url);
        }
      })
      .catch(() => null);

  return (
    <section className="card konto" aria-labelledby="anmeldemethoden-titel">
      <h2 id="anmeldemethoden-titel">Anmelden mit Google und Microsoft</h2>
      <p className="field__hint">
        Verknüpft melden Sie sich mit einem Klick an, ohne Passwort. Den zweiten
        Faktor verlangt Stegwerk trotzdem, wenn er eingeschaltet ist.
      </p>

      {rueckmeldung !== null && (
        <div
          className={
            rueckmeldung.art === 'fehler' ? 'error-banner' : 'auth__hinweis'
          }
          role={rueckmeldung.art === 'fehler' ? 'alert' : 'status'}
        >
          {rueckmeldung.text}
        </div>
      )}
      {fehler !== undefined && (
        <div className="error-banner" role="alert">
          {fehler.message}
        </div>
      )}

      <ul className="anmeldemethoden">
        {anbieter.map((welcher) => {
          const verknuepft = verknuepfungen.find((v) => v.anbieter === welcher);

          return (
            <li key={welcher} className="anmeldemethoden__eintrag">
              <SsoZeichen anbieter={welcher} />
              <div className="anmeldemethoden__text">
                <strong>{ssoName(welcher)}</strong>
                <span className="field__hint">
                  {verknuepft === undefined
                    ? 'Nicht verknüpft'
                    : `${verknuepft.email ?? 'Verknüpft'} · seit ${DATUM.format(
                        new Date(verknuepft.createdAt),
                      )}`}
                </span>
              </div>
              {verknuepft === undefined ? (
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={!bestaetigt || start.loading}
                  aria-expanded={mitPasswort ? waehlt === welcher : undefined}
                  onClick={() => {
                    if (mitPasswort) {
                      setWaehlt(waehlt === welcher ? null : welcher);
                    } else {
                      verknuepfen(welcher);
                    }
                  }}
                >
                  Verknüpfen
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={trennung.loading || !trennenErlaubt}
                  aria-describedby={
                    trennenErlaubt ? undefined : 'anmeldemethoden-letzte'
                  }
                  onClick={() =>
                    void trennen({ variables: { anbieter: welcher } })
                      .then(() => {
                        void refetch();
                        toast.zeige({
                          text: `Anmelden mit ${ssoName(welcher)} getrennt.`,
                        });
                      })
                      .catch(() => null)
                  }
                >
                  Trennen
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!bestaetigt && (
        <p className="field__hint">
          Bestätigen Sie zuerst Ihre E-Mail-Adresse; erst dann lässt sich ein
          Konto verknüpfen.
        </p>
      )}
      {!trennenErlaubt && (
        <p className="field__hint" id="anmeldemethoden-letzte">
          Trennen geht erst, wenn Sie oben ein Passwort festgelegt haben – sonst
          kämen Sie nicht mehr hinein.
        </p>
      )}

      {waehlt !== null && mitPasswort && (
        <form
          className="konto__form"
          onSubmit={(ereignis) => {
            ereignis.preventDefault();
            verknuepfen(waehlt);
          }}
        >
          <div className="field">
            <label htmlFor="anmeldemethode-passwort">
              Ihr Stegwerk-Passwort, zur Bestätigung
            </label>
            <input
              id="anmeldemethode-passwort"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={passwort}
              onChange={(ereignis) => setPasswort(ereignis.target.value)}
            />
          </div>
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={passwort === '' || start.loading}
            >
              Weiter zu {ssoName(waehlt)}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setWaehlt(null)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export const EmailAendernSection = () => {
  const [neu, setNeu] = useState('');
  const [passwort, setPasswort] = useState('');
  const [unterwegs, setUnterwegs] = useState<string | null>(null);
  const [anfragen, { loading, error }] = useMutation(EMAIL_AENDERN_ANFRAGEN);

  return (
    <section className="card konto">
      <h2>Anmelde-Adresse ändern</h2>
      {unterwegs !== null ? (
        <p>
          Ein Link ist an <strong>{unterwegs}</strong> unterwegs. Öffnen Sie ihn
          in diesem Browser; bis dahin gilt die bisherige Adresse.
        </p>
      ) : (
        <form
          className="konto__form"
          onSubmit={(event) => {
            event.preventDefault();
            void anfragen({
              variables: { input: { neueEmail: neu.trim(), passwort } },
            })
              .then(() => {
                setUnterwegs(neu.trim());
                setPasswort('');
              })
              .catch(() => null);
          }}
        >
          <div className="field">
            <label htmlFor="konto-neue-email">Neue Adresse</label>
            <input
              id="konto-neue-email"
              type="email"
              required
              autoComplete="email"
              value={neu}
              onChange={(event) => setNeu(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="konto-email-passwort">Passwort</label>
            <input
              id="konto-email-passwort"
              type="password"
              required
              autoComplete="current-password"
              value={passwort}
              onChange={(event) => setPasswort(event.target.value)}
            />
          </div>
          {error !== undefined && (
            <div className="error-banner">{error.message}</div>
          )}
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={loading || neu.trim() === '' || passwort === ''}
            >
              Link an neue Adresse senden
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export const KontoLoeschenSection = () => {
  const { endSession } = useAuth();
  const [offen, setOffen] = useState(false);
  const [passwort, setPasswort] = useState('');
  const [wort, setWort] = useState('');
  const [loeschen, { loading, error }] = useMutation(KONTO_LOESCHEN);

  return (
    <section className="card konto konto--gefahr">
      <h2>Konto löschen</h2>
      <p className="field__hint">
        Entfernt Ihren Namen, Ihre Adresse und Ihre Anmeldedaten und meldet Sie
        überall ab. Was Sie in Arbeitsbereichen angelegt haben, bleibt dort;
        Ihre offenen Aufgaben und Kunden gehen an den Inhaber. Sind Sie einziger
        Inhaber eines Bereichs, übergeben Sie ihn vorher.
      </p>
      {!offen ? (
        <button
          type="button"
          className="button button--danger"
          onClick={() => setOffen(true)}
        >
          Konto löschen …
        </button>
      ) : (
        <form
          className="konto__form"
          onSubmit={(event) => {
            event.preventDefault();
            void loeschen({ variables: { passwort } })
              .then(() => {
                endSession();
                window.location.assign('/');
              })
              .catch(() => null);
          }}
        >
          <div className="field">
            <label htmlFor="konto-loeschen-passwort">Passwort</label>
            <input
              id="konto-loeschen-passwort"
              type="password"
              required
              autoComplete="current-password"
              value={passwort}
              onChange={(event) => setPasswort(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="konto-loeschen-wort">
              Zur Bestätigung LÖSCHEN eingeben
            </label>
            <input
              id="konto-loeschen-wort"
              value={wort}
              onChange={(event) => setWort(event.target.value)}
            />
          </div>
          {error !== undefined && (
            <div className="error-banner">{error.message}</div>
          )}
          <div className="row-actions">
            <button
              type="submit"
              className="button button--danger"
              disabled={loading || passwort === '' || wort !== 'LÖSCHEN'}
            >
              Endgültig löschen
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setOffen(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export const ZweiFaktorPflichtSection = () => {
  const { session } = useAuth();
  const rechte = usePermissions();
  const { data } = useQuery<{ myWorkspaces: WorkspaceMembership[] }>(
    MY_WORKSPACES,
  );
  const { data: status } = useQuery<{
    twoFactorStatus: { enabled: boolean };
  }>(TWO_FACTOR_STATUS);
  const [setzen, { loading, error }] = useMutation(SET_ZWEI_FAKTOR_PFLICHT);

  if (!rechte.can('workspace:fields')) {
    return null;
  }

  const bereich = data?.myWorkspaces.find(
    (m) => m.workspace.id === session?.workspace.id,
  )?.workspace;
  const an = bereich?.zweiFaktorPflicht === true;
  const selbstAktiv = status?.twoFactorStatus.enabled === true;

  return (
    <section className="card konto">
      <h2>Zwei-Faktor-Pflicht für das Team</h2>
      <p className="field__hint">
        Eingeschaltet kommt niemand mehr ohne zweiten Faktor an die Daten dieses
        Bereichs. Wer ihn noch nicht hat, wird nach der Anmeldung zur
        Einrichtung geführt.
      </p>
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={an}
          disabled={loading || bereich === undefined || (!an && !selbstAktiv)}
          onChange={(event) =>
            void setzen({ variables: { an: event.target.checked } }).catch(
              () => null,
            )
          }
        />{' '}
        Zwei-Faktor-Anmeldung für alle verlangen
      </label>
      {!an && !selbstAktiv && (
        <p className="field__hint">
          Richten Sie sie zuerst oben für Ihr eigenes Konto ein.
        </p>
      )}
    </section>
  );
};

export const LeerlaufSection = () => {
  const { session } = useAuth();
  const rechte = usePermissions();
  const { data } = useQuery<{
    myWorkspaces: {
      workspace: { id: string; leerlaufMinuten: number | null };
    }[];
  }>(LEERLAUF);
  const [setzen, { loading, error }] = useMutation(SET_LEERLAUF);
  const toast = useToast();

  if (!rechte.can('workspace:fields')) {
    return null;
  }

  const bereich = data?.myWorkspaces.find(
    (m) => m.workspace.id === session?.workspace.id,
  )?.workspace;
  const aktuell = bereich?.leerlaufMinuten ?? null;

  return (
    <section className="card konto">
      <h2>Abmelden nach Leerlauf</h2>
      <p className="field__hint">
        Wer so lange nichts eingibt, wird in allen Tabs abgemeldet; eine Minute
        vorher erscheint eine Warnung. Das schützt Daten auf Rechnern, die
        unbeaufsichtigt stehen bleiben.
      </p>
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      <div className="field">
        <label htmlFor="leerlauf-minuten">Abmelden</label>
        <select
          id="leerlauf-minuten"
          value={aktuell === null ? '' : String(aktuell)}
          disabled={loading || bereich === undefined}
          onChange={(event) => {
            const minuten =
              event.target.value === '' ? null : Number(event.target.value);

            void setzen({ variables: { minuten } })
              .then(() =>
                toast.zeige({ text: 'Abmelden nach Leerlauf gespeichert.' }),
              )
              .catch(() => null);
          }}
        >
          {LEERLAUF_STUFEN.map((stufe) => (
            <option
              key={stufe.label}
              value={stufe.minuten === null ? '' : String(stufe.minuten)}
            >
              {stufe.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
};

export const EinladungsDomainsSection = () => {
  const { session } = useAuth();
  const rechte = usePermissions();
  const toast = useToast();
  const abfrage = useQuery<{
    myWorkspaces: {
      workspace: { id: string; einladungsDomains: string[] };
    }[];
  }>(EINLADUNGS_DOMAINS, { skip: !rechte.can('workspace:members') });
  const { data } = abfrage;
  const [setzen, { loading, error }] = useMutation(SET_EINLADUNGS_DOMAINS);
  const [text, setText] = useState<string | null>(null);

  if (!rechte.can('workspace:members')) {
    return null;
  }

  const gespeichert =
    data?.myWorkspaces.find((m) => m.workspace.id === session?.workspace.id)
      ?.workspace.einladungsDomains ?? [];
  const eingabe = text ?? domainsAlsText(gespeichert);
  const domains = domainsAusText(eingabe);
  const warnung =
    session !== null && eigeneDomainFehlt(session.user.email, domains);

  const speichern = (event: FormEvent) => {
    event.preventDefault();

    void setzen({ variables: { domains } })
      .then(() => {
        setText(null);
        toast.zeige({
          text:
            domains.length === 0
              ? 'Einladungen an jede Adresse sind wieder möglich.'
              : 'Erlaubte Domains gespeichert.',
        });
      })
      .catch(() => null);
  };

  return (
    <section className="card konto">
      <h2>Einladungen nur an diese Domains</h2>
      <p className="field__hint">
        Tragen Sie die Domains Ihrer Firma ein, etwa beispiel.de. Dann lässt
        sich niemand mit einer privaten oder fremden Adresse einladen;
        Unterdomains zählen mit. Leer heißt: jede Adresse. Wer schon im Team
        ist, bleibt es.
      </p>
      {abfrage.error !== undefined && (
        <div className="error-banner" role="alert">
          Die erlaubten Domains ließen sich nicht laden: {abfrage.error.message}{' '}
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void abfrage.refetch().catch(() => null)}
          >
            Erneut laden
          </button>
        </div>
      )}
      {abfrage.loading && data === undefined && (
        <p className="field__hint" role="status">
          Domains werden geladen…
        </p>
      )}
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      <form className="einladungs-domains" onSubmit={speichern}>
        <div className="field">
          <label htmlFor="einladungs-domains">Erlaubte Domains</label>
          <input
            id="einladungs-domains"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="beispiel.de, beispiel.com"
            aria-describedby={
              warnung ? 'einladungs-domains-warnung' : undefined
            }
            value={eingabe}
            disabled={data === undefined}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {warnung && (
          <p
            id="einladungs-domains-warnung"
            className="field__hint einladungs-domains__warnung"
          >
            Ihre eigene Adresse liegt nicht in diesen Domains. Sie bleiben im
            Team, aber Kolleginnen mit einer Adresse wie Ihrer ließen sich nicht
            mehr einladen.
          </p>
        )}
        <button
          className="button"
          type="submit"
          disabled={loading || data === undefined || text === null}
        >
          {loading ? 'Speichern…' : 'Speichern'}
        </button>
      </form>
    </section>
  );
};
