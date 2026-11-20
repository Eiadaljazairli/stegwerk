import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useEffect, useState } from 'react';

import {
  KALENDER_ABGLEICHEN,
  KALENDER_LISTE,
  KALENDER_SICHTBARKEIT_SETZEN,
  KALENDER_TRENNEN,
  KALENDER_VERBINDEN,
  KALENDER_VERBINDUNG,
  KALENDER_WAEHLEN,
} from '../lib/queries';
import { type KalenderVerbindung } from '../lib/types';
import { AbhilfeLink } from './AbhilfeLink';
import { Dialogfenster } from './Dialogfenster';
import {
  anbieterName,
  OAuthKnoepfe,
  useOAuthAngeboten,
  useOAuthRueckmeldung,
} from './OAuthAnmeldung';

type Anbieter = { name: string; url: string; hinweis: string };

const ANBIETER: Anbieter[] = [
  {
    name: 'Nextcloud',
    url: 'https://IHRE-NEXTCLOUD/remote.php/dav/',
    hinweis:
      'Eigene Adresse einsetzen. App-Passwort unter Einstellungen → Sicherheit.',
  },
  {
    name: 'IONOS',
    url: '',
    hinweis:
      'Die CalDAV-Adresse steht im IONOS-Kundenbereich beim Kalender unter „Synchronisieren“.',
  },
  {
    name: 'mailbox.org',
    url: 'https://dav.mailbox.org/',
    hinweis: 'Benutzer ist die Mailadresse.',
  },
  {
    name: 'iCloud',
    url: 'https://caldav.icloud.com/',
    hinweis:
      'Benutzer ist die Apple-ID. App-spezifisches Passwort unter account.apple.com erzeugen.',
  },
  {
    name: 'Fastmail',
    url: 'https://caldav.fastmail.com/',
    hinweis: 'App-Passwort unter Einstellungen → Privatsphäre & Sicherheit.',
  },
];

const wann = (iso: string): string =>
  new Date(iso).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export const KalenderVerbindenButton = () => {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [benutzer, setBenutzer] = useState('');
  const [passwort, setPasswort] = useState('');
  const [hinweis, setHinweis] = useState<string | null>(null);
  const oauthAngeboten = useOAuthAngeboten();
  const rueckmeldung = useOAuthRueckmeldung();

  useEffect(() => {
    if (rueckmeldung !== null) {
      setOffen(true);
      setFehler(rueckmeldung.ok ? null : rueckmeldung.text);
    }
  }, [rueckmeldung]);

  const { data } = useQuery<{ kalenderVerbindung: KalenderVerbindung | null }>(
    KALENDER_VERBINDUNG,
  );
  const verbindung = data?.kalenderVerbindung ?? null;
  const { data: liste } = useQuery<{
    kalenderListe: { url: string; name: string }[];
  }>(KALENDER_LISTE, { skip: !offen || verbindung === null });

  const refetchQueries = [{ query: KALENDER_VERBINDUNG }];
  const [verbinden, { loading: verbindet }] = useMutation(KALENDER_VERBINDEN, {
    refetchQueries: [...refetchQueries, { query: KALENDER_LISTE }],
  });
  const [waehlen] = useMutation(KALENDER_WAEHLEN, { refetchQueries });
  const [abgleichen, { loading: gleichtAb }] = useMutation(
    KALENDER_ABGLEICHEN,
    { refetchQueries: ['Appointments', 'KalenderVerbindung'] },
  );
  const [trennen] = useMutation(KALENDER_TRENNEN, { refetchQueries });
  const [sichtbarkeitSetzen] = useMutation(KALENDER_SICHTBARKEIT_SETZEN, {
    refetchQueries: ['Appointments', 'KalenderVerbindung'],
  });

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const absenden = (event: FormEvent): void => {
    event.preventDefault();
    setFehler(null);
    void verbinden({ variables: { input: { serverUrl, benutzer, passwort } } })
      .then(() => setPasswort(''))
      .catch(fang);
  };

  return (
    <div className="datev">
      <button
        type="button"
        className="button button--ghost"
        aria-haspopup="dialog"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        {verbindung === null ? 'Kalender verbinden' : 'Kalender verbunden'}
        {verbindung?.letzterFehler != null &&
          verbindung.fehlerZeigen !== false && (
            <span className="kalender-sync__punkt" aria-label="mit Fehler" />
          )}
      </button>

      {offen && (
        <Dialogfenster
          titel="Kalender verbinden"
          breit
          onClose={() => setOffen(false)}
        >
          <p className="field__hint">
            Termine gehen in beide Richtungen: was Sie hier anlegen, steht in
            Ihrem Kalender, und was Sie dort eintragen, kommt alle zehn Minuten
            hierher. Bei gleichzeitigen Änderungen gilt die jüngere.
          </p>

          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
              <AbhilfeLink meldung={fehler} />
            </div>
          )}

          {verbindung === null ? (
            <form className="kalender-sync__form" onSubmit={absenden}>
              <div className="kalender-sync__anbieter">
                {ANBIETER.map((anbieter) => (
                  <button
                    key={anbieter.name}
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => {
                      setServerUrl(anbieter.url);
                      setHinweis(anbieter.hinweis);
                    }}
                  >
                    {anbieter.name}
                  </button>
                ))}
              </div>
              {hinweis !== null && <p className="field__hint">{hinweis}</p>}
              {oauthAngeboten ? (
                <>
                  <p className="field__hint">
                    Google Kalender und Microsoft 365 über die Anmeldung beim
                    Anbieter:
                  </p>
                  <OAuthKnoepfe zweck="kalender" />
                  <p className="field__hint">Alle anderen per CalDAV:</p>
                </>
              ) : (
                <p className="field__hint">
                  Google Kalender und Microsoft 365 lassen sich so nicht
                  verbinden, sie verlangen eine Anmeldung über OAuth. Für sie
                  gibt es das Abo.
                </p>
              )}

              <div className="field">
                <label htmlFor="kalender-url">Serveradresse</label>
                <input
                  id="kalender-url"
                  type="url"
                  required
                  placeholder="https://"
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="kalender-benutzer">Benutzer</label>
                <input
                  id="kalender-benutzer"
                  required
                  autoComplete="username"
                  value={benutzer}
                  onChange={(event) => setBenutzer(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="kalender-passwort">App-Passwort</label>
                <input
                  id="kalender-passwort"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={passwort}
                  onChange={(event) => setPasswort(event.target.value)}
                />
                <span className="field__hint">
                  Ein eigenes Passwort nur für Stegwerk, nicht das Ihres Kontos.
                  Es wird verschlüsselt gespeichert.
                </span>
              </div>
              <button type="submit" className="button" disabled={verbindet}>
                {verbindet ? 'Wird geprüft…' : 'Verbinden'}
              </button>
            </form>
          ) : (
            <>
              <dl className="kalender-sync__stand">
                <dt>
                  {verbindung.anbieter === 'caldav' ? 'Server' : 'Anbieter'}
                </dt>
                <dd>
                  {verbindung.anbieter === 'caldav'
                    ? new URL(verbindung.serverUrl).host
                    : anbieterName(verbindung.anbieter)}
                </dd>
                <dt>Benutzer</dt>
                <dd>{verbindung.benutzer}</dd>
                <dt>Letzter Abgleich</dt>
                <dd>
                  {verbindung.letzterSyncAm === null
                    ? 'noch keiner'
                    : wann(verbindung.letzterSyncAm)}
                </dd>
              </dl>

              {verbindung.letzterFehler !== null && (
                <div className="error-banner">
                  {verbindung.letzterFehler}
                  <AbhilfeLink meldung={verbindung.letzterFehler} />
                </div>
              )}
              {verbindung.letzterFehler !== null &&
                verbindung.anbieter !== 'caldav' && (
                  <OAuthKnoepfe zweck="kalender" text="neu verbinden" />
                )}

              <div className="field">
                <label htmlFor="kalender-wahl">Kalender</label>
                <select
                  id="kalender-wahl"
                  value={verbindung.kalenderUrl ?? ''}
                  onChange={(event) => {
                    setFehler(null);
                    void waehlen({
                      variables: { url: event.target.value },
                    }).catch(fang);
                  }}
                >
                  {verbindung.kalenderUrl === null && (
                    <option value="">Bitte wählen</option>
                  )}
                  {(liste?.kalenderListe ?? []).map((kalender) => (
                    <option key={kalender.url} value={kalender.url}>
                      {kalender.name}
                    </option>
                  ))}
                  {liste === undefined && verbindung.kalenderUrl !== null && (
                    <option value={verbindung.kalenderUrl}>
                      {verbindung.kalenderName ?? 'Kalender'}
                    </option>
                  )}
                </select>
              </div>

              <div className="field">
                <label htmlFor="kalender-sichtbarkeit">
                  Was das Team von Terminen aus diesem Kalender sieht
                </label>
                <select
                  id="kalender-sichtbarkeit"
                  aria-describedby="kalender-sichtbarkeit-hinweis"
                  value={verbindung.sichtbarkeit ?? 'alles'}
                  onChange={(event) => {
                    setFehler(null);
                    void sichtbarkeitSetzen({
                      variables: { sichtbarkeit: event.target.value },
                    }).catch(fang);
                  }}
                >
                  <option value="belegt">Nur „belegt“</option>
                  <option value="alles">Alles (Titel, Ort, Teilnehmer)</option>
                </select>
                <span
                  id="kalender-sichtbarkeit-hinweis"
                  className="field__hint"
                >
                  Bei „belegt“ sehen Kollegen Zeit und Ihren Namen, aber keinen
                  Titel, Ort oder Teilnehmer — außer bei Terminen, die an einem
                  Kunden oder Geschäft hängen. Was dort als privat markiert ist,
                  bleibt immer privat.
                </span>
              </div>

              <div className="calendar-feed__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={gleichtAb || verbindung.kalenderUrl === null}
                  onClick={() => {
                    setFehler(null);
                    void abgleichen().catch(fang);
                  }}
                >
                  {gleichtAb ? 'Gleicht ab…' : 'Jetzt abgleichen'}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => void trennen().catch(fang)}
                >
                  Trennen
                </button>
              </div>
              <p className="field__hint">
                Nach dem Trennen bleiben übernommene Termine hier stehen.
              </p>
            </>
          )}
        </Dialogfenster>
      )}
    </div>
  );
};
