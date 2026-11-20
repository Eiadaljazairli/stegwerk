import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { CONNECT_MAILBOX } from '../lib/queries';
import { AbhilfeLink } from './AbhilfeLink';
import { OAuthKnoepfe, useOAuthAngeboten } from './OAuthAnmeldung';

export type VerbindenArt = 'haupt' | 'weiteres' | 'gemeinsam';

const GESENDET_ORDNER = [
  'Sent',
  'Gesendet',
  'Gesendete Elemente',
  'Gesendete Objekte',
  'INBOX.Sent',
  '[Gmail]/Gesendet',
  '[Gmail]/Sent Mail',
];

const ANBIETER: {
  name: string;
  host: string;
  port: number;
  smtpHost: string;
  smtpPort: number;
}[] = [
  {
    name: 'IONOS',
    host: 'imap.ionos.de',
    port: 993,
    smtpHost: 'smtp.ionos.de',
    smtpPort: 587,
  },
  {
    name: 'Strato',
    host: 'imap.strato.de',
    port: 993,
    smtpHost: 'smtp.strato.de',
    smtpPort: 587,
  },
  {
    name: 'Microsoft 365',
    host: 'outlook.office365.com',
    port: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
  },
  {
    name: 'Google Workspace',
    host: 'imap.gmail.com',
    port: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
  },
  {
    name: 'GMX',
    host: 'imap.gmx.net',
    port: 993,
    smtpHost: 'mail.gmx.net',
    smtpPort: 587,
  },
  {
    name: 'Web.de',
    host: 'imap.web.de',
    port: 993,
    smtpHost: 'smtp.web.de',
    smtpPort: 587,
  },
];

const TITEL: Record<VerbindenArt, string> = {
  haupt: 'Postfach verbinden',
  weiteres: 'Weiteres eigenes Postfach verbinden',
  gemeinsam: 'Gemeinsames Postfach einrichten',
};

export const PostfachVerbinden = ({
  art,
  verbunden,
  abbrechen,
}: {
  art: VerbindenArt;
  verbunden: () => Promise<unknown> | void;
  abbrechen?: () => void;
}): JSX.Element => {
  const [connect, { loading: connecting }] = useMutation(CONNECT_MAILBOX);
  const oauthAngeboten = useOAuthAngeboten();
  const kennung = `postfach-${art}`;

  const [bezeichnung, setBezeichnung] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [gesendetOrdner, setGesendetOrdner] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [fehler, setFehler] = useState<string | null>(null);

  const verbinden = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFehler(null);

    try {
      await connect({
        variables: {
          input: {
            host: host.trim(),
            port: Number(port),
            secure,
            username: username.trim(),
            password,
            folder: folder.trim() === '' ? 'INBOX' : folder.trim(),
            smtpHost: smtpHost.trim() === '' ? null : smtpHost.trim(),
            smtpPort: smtpHost.trim() === '' ? null : Number(smtpPort),
            smtpSecure: Number(smtpPort) === 465,
            ...(gesendetOrdner.trim() === ''
              ? {}
              : { gesendetOrdner: gesendetOrdner.trim() }),
            ...(art === 'haupt'
              ? {}
              : {
                  neu: art === 'gemeinsam' ? 'gemeinsam' : 'persoenlich',
                  ...(bezeichnung.trim() === ''
                    ? {}
                    : { bezeichnung: bezeichnung.trim() }),
                }),
          },
        },
      });
      setPassword('');
      await verbunden();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Unbekannter Fehler.');
    }
  };

  return (
    <form
      className="card"
      aria-labelledby={`${kennung}-titel`}
      onSubmit={(event) => void verbinden(event)}
    >
      <h2 id={`${kennung}-titel`}>{TITEL[art]}</h2>

      {art === 'gemeinsam' && (
        <p className="field__hint">
          Ein gemeinsames Postfach wie info@ oder vertrieb@ wird einmal
          verbunden. Lesen, antworten und Gespräche zuweisen können danach die
          Mitglieder, die Sie unten festlegen; in den Akten sehen die Post
          zunächst nur sie.
        </p>
      )}

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
          <AbhilfeLink meldung={fehler} />
        </div>
      )}

      {art !== 'haupt' && (
        <div className="field">
          <label htmlFor={`${kennung}-bezeichnung`}>
            Bezeichnung (optional)
          </label>
          <input
            id={`${kennung}-bezeichnung`}
            value={bezeichnung}
            maxLength={100}
            onChange={(event) => setBezeichnung(event.target.value)}
            placeholder={art === 'gemeinsam' ? 'Vertrieb' : 'Zweites Postfach'}
          />
        </div>
      )}

      {oauthAngeboten && (
        <>
          <p className="field__hint">
            Gmail, Google Workspace und Microsoft 365 verbinden Sie am
            einfachsten über die Anmeldung beim Anbieter — ohne App-Passwort.
            {art === 'gemeinsam' &&
              ' Melden Sie sich dort mit dem Konto des gemeinsamen Postfachs an.'}
          </p>
          <OAuthKnoepfe
            zweck="postfach"
            {...(art === 'haupt' ? {} : { postfachArt: art })}
          />
          <p className="field__hint">
            Alle anderen Anbieter mit IMAP und Passwort:
          </p>
        </>
      )}

      <p className="field__hint">
        Ein Klick setzt Server und Port. Fehlt Ihr Anbieter, tragen Sie beides
        von Hand ein.
      </p>
      <div className="mailbox__providers">
        {ANBIETER.map((anbieter) => (
          <button
            key={anbieter.name}
            type="button"
            className="button button--ghost"
            onClick={() => {
              setHost(anbieter.host);
              setPort(String(anbieter.port));
              setSecure(true);
              setSmtpHost(anbieter.smtpHost);
              setSmtpPort(String(anbieter.smtpPort));
            }}
          >
            {anbieter.name}
          </button>
        ))}
      </div>

      <div className="mailbox__grid">
        <div className="field field--wide">
          <label htmlFor={`${kennung}-host`}>IMAP Server</label>
          <input
            id={`${kennung}-host`}
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="imap.ihr-anbieter.de"
            required
          />
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-port`}>Port</label>
          <input
            id={`${kennung}-port`}
            value={port}
            inputMode="numeric"
            onChange={(event) => setPort(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-secure`}>Verschlüsselung</label>
          <select
            id={`${kennung}-secure`}
            value={secure ? 'ssl' : 'starttls'}
            onChange={(event) => setSecure(event.target.value === 'ssl')}
          >
            <option value="ssl">SSL, üblich auf Port 993</option>
            <option value="starttls">STARTTLS, üblich auf Port 143</option>
          </select>
        </div>

        <div className="field field--wide">
          <label htmlFor={`${kennung}-username`}>Benutzername</label>
          <input
            id={`${kennung}-username`}
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder={
              art === 'gemeinsam' ? 'info@firma.de' : 'ihre.adresse@firma.de'
            }
            required
          />
        </div>

        <div className="field field--wide">
          <label htmlFor={`${kennung}-password`}>Passwort</label>
          <input
            id={`${kennung}-password`}
            type="password"
            value={password}
            autoComplete="off"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="field__hint">
            Wird verschlüsselt abgelegt und nirgends wieder angezeigt. Bei
            Microsoft und Google brauchen Sie ein App Passwort statt Ihres
            normalen.
          </p>
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-folder`}>Ordner</label>
          <input
            id={`${kennung}-folder`}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="INBOX"
          />
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-sent`}>Gesendet-Ordner (optional)</label>
          <input
            id={`${kennung}-sent`}
            list={`${kennung}-sent-vorschlaege`}
            value={gesendetOrdner}
            onChange={(event) => setGesendetOrdner(event.target.value)}
            placeholder="Sent"
          />
          <datalist id={`${kennung}-sent-vorschlaege`}>
            {GESENDET_ORDNER.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="field__hint">
            Dann erscheint auch, was aus dem Mailprogramm geschrieben wurde.
          </p>
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-smtp-host`}>Postausgang (optional)</label>
          <input
            id={`${kennung}-smtp-host`}
            value={smtpHost}
            onChange={(event) => setSmtpHost(event.target.value)}
            placeholder="smtp.anbieter.de"
          />
          <p className="field__hint">
            Nur nötig, wenn aus Stegwerk heraus geantwortet werden soll. Leer
            gelassen wird das Postfach ausschließlich gelesen.
          </p>
        </div>

        <div className="field">
          <label htmlFor={`${kennung}-smtp-port`}>Port des Postausgangs</label>
          <input
            id={`${kennung}-smtp-port`}
            value={smtpPort}
            onChange={(event) => setSmtpPort(event.target.value)}
            inputMode="numeric"
            placeholder="587"
          />
        </div>
      </div>

      <div className="row-actions">
        <button type="submit" className="button" disabled={connecting}>
          {connecting ? 'Wird geprüft…' : 'Verbinden'}
        </button>
        {abbrechen !== undefined && (
          <button
            type="button"
            className="button button--quiet"
            onClick={abbrechen}
          >
            Abbrechen
          </button>
        )}
      </div>
      <p className="field__hint">
        Die Zugangsdaten werden zuerst ausprobiert. Erst wenn der Server
        antwortet, werden sie gespeichert.
      </p>
    </form>
  );
};
