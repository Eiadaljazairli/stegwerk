import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { ABSENDER_PRUEFUNG, SET_POSTFACH_EINSTELLUNGEN } from '../lib/queries';
import { type Mailbox } from '../lib/types';
import {
  AMPEL_TEXT,
  type AbsenderPruefung,
  dmarcText,
  geprueftText,
  spfText,
} from '../lib/zustellbarkeit';

type Schalter =
  | 'ausschlussIntern'
  | 'ausschlussMassenpost'
  | 'ausschlussGruppen'
  | 'ausschlussFreemail';

const SCHALTER: { feld: Schalter; text: string; hinweis: string }[] = [
  {
    feld: 'ausschlussIntern',
    text: 'Post nur unter Kollegen weglassen',
    hinweis: 'Wenn alle Beteiligten aus dem eigenen Team sind.',
  },
  {
    feld: 'ausschlussMassenpost',
    text: 'Newsletter und Benachrichtigungen weglassen',
    hinweis: 'Erkannt an Verteiler-Kopfzeilen und an Absendern wie no-reply@.',
  },
  {
    feld: 'ausschlussGruppen',
    text: 'Post von Sammeladressen weglassen (info@, kontakt@, support@ …)',
    hinweis:
      'Aus. Bei vielen Kunden schreibt die Geschäftsleitung von info@ — die Post gehört in die Akte.',
  },
  {
    feld: 'ausschlussFreemail',
    text: 'Post nur mit privaten Adressen weglassen (gmx.de, web.de, gmail.com …)',
    hinweis: 'Für Teams, die nur Geschäftskunden betreuen.',
  },
];

export const PostfachEinstellungen = ({
  mailbox,
}: {
  mailbox: Mailbox;
}): JSX.Element => {
  const [setzen, { loading }] = useMutation(SET_POSTFACH_EINSTELLUNGEN);
  const [aliase, setAliase] = useState(mailbox.aliase.join(', '));
  const [grenze, setGrenze] = useState(String(mailbox.anhaengeBisMb));
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  const speichern = async (input: Record<string, unknown>): Promise<void> => {
    setFehler(null);
    setGespeichert(false);

    try {
      await setzen({ variables: { input, mailboxId: mailbox.id } });
      setGespeichert(true);
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Nicht gespeichert.',
      );
    }
  };

  const absenderSpeichern = (event: FormEvent): void => {
    event.preventDefault();
    void speichern({
      aliase: aliase
        .split(/[\s,;]+/u)
        .map((adresse) => adresse.trim())
        .filter((adresse) => adresse !== ''),
    });
  };

  return (
    <section className="card postfach-einstellungen">
      <h2>Was in die Akten kommt</h2>

      {SCHALTER.map(({ feld, text, hinweis }) => (
        <div className="field" key={feld}>
          <label className="postfach-einstellungen__schalter">
            <input
              type="checkbox"
              checked={mailbox[feld]}
              disabled={loading}
              onChange={(event) =>
                void speichern({ [feld]: event.target.checked })
              }
            />
            {text}
          </label>
          <p className="field__hint">{hinweis}</p>
        </div>
      ))}

      {mailbox.istGmail === true && (
        <div className="field">
          <label className="postfach-einstellungen__schalter">
            <input
              type="checkbox"
              checked={mailbox.ausschlussGmailKategorien !== false}
              disabled={loading}
              onChange={(event) =>
                void speichern({
                  ausschlussGmailKategorien: event.target.checked,
                })
              }
            />
            Gmail-Kategorien weglassen (Werbung, Soziale Netzwerke, Foren,
            Benachrichtigungen)
          </label>
          <p className="field__hint">
            So, wie Gmail Ihre Post selbst einsortiert. Was im Reiter
            „Allgemein“ landet, kommt weiter in die Akten.
          </p>
        </div>
      )}

      <p className="field__hint">
        Gilt für Post, die ab jetzt gelesen wird. Einzelne Adressen und Domains
        schließen Sie unten über die Sperrliste aus.
      </p>

      <h3>Anhänge</h3>
      <div className="field">
        <label className="postfach-einstellungen__schalter">
          <input
            type="checkbox"
            checked={mailbox.anhaengeAutomatisch}
            disabled={loading || mailbox.sichtbarkeit !== 'alles'}
            onChange={(event) =>
              void speichern({ anhaengeAutomatisch: event.target.checked })
            }
          />
          Anhänge zugeordneter Post von selbst an die Akte legen
        </label>
        <p className="field__hint">
          {mailbox.sichtbarkeit === 'alles'
            ? 'Sonst holen Sie einen Anhang mit „An Akte speichern“ an der Nachricht.'
            : 'Nur möglich, wenn das Team Ihre Post ganz sieht — sonst läge an der Akte, was Ihr Postfach verbirgt.'}
        </p>
      </div>
      {mailbox.anhaengeAutomatisch && (
        <div className="field">
          <label htmlFor={`anhaenge-grenze-${mailbox.id}`}>
            Bis zu einer Größe von (MB)
          </label>
          <input
            id={`anhaenge-grenze-${mailbox.id}`}
            type="number"
            min={1}
            max={20}
            value={grenze}
            onChange={(event) => setGrenze(event.target.value)}
            onBlur={() => {
              const wert = Number(grenze);

              if (Number.isInteger(wert) && wert !== mailbox.anhaengeBisMb) {
                void speichern({ anhaengeBisMb: wert });
              }
            }}
          />
          <p className="field__hint">
            Größere bleiben im Postfach und lassen sich einzeln holen. Alle
            Anhänge zählen zum Speicher des Arbeitsbereichs.
          </p>
        </div>
      )}

      <h3>Weitere Absenderadressen</h3>
      <form className="field" onSubmit={absenderSpeichern}>
        <label htmlFor={`postfach-aliase-${mailbox.id}`}>
          Adressen, unter denen Sie aus diesem Postfach schreiben
        </label>
        <input
          id={`postfach-aliase-${mailbox.id}`}
          type="text"
          placeholder="vertrieb@firma.de, info@firma.de"
          value={aliase}
          onChange={(event) => setAliase(event.target.value)}
        />
        <p className="field__hint">
          Beim Schreiben wählen Sie dann unter „Von“. Der Mailserver muss die
          Adresse für Ihr Postfach erlauben (bei Microsoft 365 „Senden als“, bei
          Gmail „Senden als“ in den Einstellungen) — sonst kommt beim Senden
          eine Meldung.
        </p>
        <div>
          <button type="submit" className="button" disabled={loading}>
            Adressen speichern
          </button>
        </div>
      </form>

      {mailbox.smtpHost !== null && mailbox.haupt && <Zustellbarkeit />}

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      {gespeichert && fehler === null && (
        <p className="field__hint" role="status">
          Gespeichert.
        </p>
      )}
    </section>
  );
};

const Zustellbarkeit = (): JSX.Element => {
  const [gefragt, setGefragt] = useState(false);
  const { data, loading, error, refetch } = useQuery<{
    absenderPruefung: AbsenderPruefung | null;
  }>(ABSENDER_PRUEFUNG, { skip: !gefragt, fetchPolicy: 'network-only' });
  const pruefung = data?.absenderPruefung ?? null;

  return (
    <div className="zustellbarkeit">
      <h3>Zustellbarkeit</h3>
      <p className="field__hint">
        Prüft im DNS Ihrer Absenderdomain, ob SPF und DMARC eingerichtet sind.
        Fehlen sie, landen Serienmails bei Gmail und Microsoft oft im Spam.
      </p>
      {!gefragt ? (
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setGefragt(true)}
        >
          Jetzt prüfen
        </button>
      ) : loading ? (
        <p className="field__hint" role="status">
          Wird geprüft…
        </p>
      ) : error !== undefined ? (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      ) : pruefung === null ? (
        <p className="field__hint">
          Die Absenderadresse hat keine prüfbare Domain.
        </p>
      ) : (
        <div role="status">
          <p
            className={`zustellbarkeit__ampel zustellbarkeit__ampel--${pruefung.ampel}`}
          >
            <span className="zustellbarkeit__punkt" aria-hidden="true" />
            {pruefung.domain}: {AMPEL_TEXT[pruefung.ampel] ?? pruefung.ampel}
          </p>
          <dl className="zustellbarkeit__liste">
            <dt>SPF</dt>
            <dd>{spfText(pruefung.spf)}</dd>
            <dt>DMARC</dt>
            <dd>{dmarcText(pruefung.dmarc)}</dd>
          </dl>
          {pruefung.hinweise.map((hinweis) => (
            <p className="field__hint" key={hinweis}>
              {hinweis}
            </p>
          ))}
          <p className="field__hint">{geprueftText(pruefung.geprueftAm)}</p>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void refetch({ frisch: true })}
          >
            Noch einmal prüfen
          </button>
        </div>
      )}
    </div>
  );
};
