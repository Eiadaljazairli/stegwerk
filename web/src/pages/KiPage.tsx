import { useMutation } from '@apollo/client';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconSuggestions } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  ANLEITUNG,
  anbieterName,
  KI_ANBIETER,
  KI_MODELLE,
  type KiAnbieter,
  modellName,
  STANDARD_MODELL,
} from '../lib/ki';
import {
  KI_EINRICHTEN,
  KI_EINSTELLUNG,
  KI_ENTFERNEN,
  KI_NUTZUNG_SETZEN,
} from '../lib/queries';
import { formatDate } from '../lib/types';
import { type KiEinstellung, useKi } from '../lib/useKi';
import { usePermissions } from '../lib/usePermissions';

const ANDERES = '__anderes__';

export const KiPage = () => {
  const { can, loading: rechteLaden } = usePermissions();
  const verwalten = can('workspace:ki');
  const { einstellung, loading } = useKi();
  const refetchQueries = [KI_EINSTELLUNG];
  const [nutzungSetzen] = useMutation(KI_NUTZUNG_SETZEN, { refetchQueries });
  const [entfernen, { loading: entfernt }] = useMutation(KI_ENTFERNEN, {
    refetchQueries,
  });
  const [aendern, setAendern] = useState(false);
  const [entfernenFragen, setEntfernenFragen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { zeige } = useToast();

  if (rechteLaden || (loading && einstellung === null)) {
    return <LoadingAnnouncement />;
  }

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  return (
    <>
      <ObjectHeader
        hilfe="ki"
        kind="data"
        icon={IconSuggestions}
        label="Einstellungen"
        title="KI"
        note="Ein Chat zu Ihren Daten und Entwürfe für Mails und Angebotstexte, mit dem API-Schlüssel Ihres eigenen Kontos bei Anthropic oder OpenAI."
      />

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {einstellung === null ? (
        <section className="card ki-seite">
          <h2>Noch nicht eingerichtet</h2>
          {verwalten ? (
            <KiFormular
              vorher={null}
              fertig={() => zeige({ text: 'Die KI ist eingerichtet.' })}
            />
          ) : (
            <p>
              Einrichten darf, wessen Rolle KI-Vorschläge verwaltet. Wenden Sie
              sich an eine Person mit Administratorrechten.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="card ki-seite">
            <h2>Eingerichtet</h2>
            <dl className="ki-seite__stand">
              <div>
                <dt>Anbieter</dt>
                <dd>{anbieterName(einstellung.anbieter)}</dd>
              </div>
              <div>
                <dt>Modell</dt>
                <dd>{modellName(einstellung.anbieter, einstellung.modell)}</dd>
              </div>
              <div>
                <dt>Zuletzt geprüft</dt>
                <dd>
                  {einstellung.geprueftAm === null
                    ? '—'
                    : formatDate(einstellung.geprueftAm)}
                </dd>
              </div>
            </dl>

            {verwalten ? (
              <fieldset className="ki-seite__nutzung">
                <legend>Wer darf die KI nutzen?</legend>
                {[
                  {
                    wert: 'alle',
                    text: 'Alle Mitglieder, jeweils mit ihren eigenen Rechten',
                  },
                  {
                    wert: 'ki_recht',
                    text: 'Nur, wer KI-Vorschläge verwalten darf',
                  },
                ].map((eintrag) => (
                  <label key={eintrag.wert} className="checkbox-field">
                    <input
                      type="radio"
                      name="ki-nutzung"
                      value={eintrag.wert}
                      checked={einstellung.nutzung === eintrag.wert}
                      onChange={() => {
                        setFehler(null);
                        void nutzungSetzen({
                          variables: { nutzung: eintrag.wert },
                        }).catch(fang);
                      }}
                    />
                    {eintrag.text}
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="field__hint">
                {einstellung.nutzung === 'ki_recht'
                  ? 'Nutzen darf die KI hier nur, wer KI-Vorschläge verwaltet.'
                  : 'Alle Mitglieder dürfen die KI nutzen, jeweils mit ihren eigenen Rechten.'}
              </p>
            )}

            {verwalten && (
              <div className="ki-seite__aktionen">
                <button
                  type="button"
                  className="button button--ghost"
                  aria-expanded={aendern}
                  onClick={() => setAendern(!aendern)}
                >
                  Modell oder Schlüssel ändern
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={entfernt}
                  onClick={() => setEntfernenFragen(true)}
                >
                  Entfernen
                </button>
              </div>
            )}
          </section>

          {verwalten && aendern && (
            <section className="card ki-seite">
              <h2>Ändern</h2>
              <KiFormular
                vorher={einstellung}
                fertig={() => {
                  setAendern(false);
                  zeige({ text: 'Gespeichert.' });
                }}
              />
            </section>
          )}
        </>
      )}

      <section className="card ki-seite">
        <h2>Was die KI darf und wohin die Daten gehen</h2>
        <ul className="ki-seite__liste">
          <li>
            Oben rechts steht „KI fragen“: ein Chat zu Firmen, Kontakten,
            Geschäften und Angeboten. Beim Schreiben einer Mail und bei
            Einleitung und Schluss eines Angebots gibt es „Entwurf mit KI“.
          </li>
          <li>
            Die KI liest über dieselben Wege wie die Oberfläche und mit den
            Rechten der Person, die fragt: sie sieht nie mehr als diese Person.
          </li>
          <li>
            Die KI ändert nichts selbst. Will sie etwas ändern, legt sie einen
            Vorschlag ab, den ein Mensch unter{' '}
            <Link to="/ki-vorschlaege">KI-Vorschläge</Link> annimmt oder
            verwirft. Ein Entwurf kommt erst mit „Übernehmen“ ins Feld, und
            gesendet wird nur von Hand.
          </li>
          <li>
            Die Frage und die Daten, die die KI dafür nachschlägt, gehen an den
            gewählten Anbieter, unter dem Vertrag Ihres Bereichs mit ihm. Die
            Kosten rechnet der Anbieter direkt mit Ihnen ab. Prüfen Sie dort,
            wie der Anbieter mit den Daten umgeht, und schließen Sie bei Bedarf
            einen Vertrag zur Auftragsverarbeitung mit ihm.
          </li>
          <li>
            Stegwerk speichert die Chats nicht; der Verlauf liegt nur im
            Browser, bis jemand „Neuer Chat“ wählt, die Seite neu lädt oder sich
            abmeldet. Einrichten, Ändern und Entfernen stehen im
            Sicherheitsprotokoll.
          </li>
        </ul>
        <p className="field__hint">
          Mehr dazu in der <Link to="/hilfe#ki">Hilfe</Link>.
        </p>
      </section>

      {entfernenFragen && (
        <ConfirmDialog
          title="KI entfernen?"
          consequence="Der Schlüssel wird gelöscht; Chat und Entwürfe sind danach für alle aus. Offene KI-Vorschläge bleiben stehen."
          confirmLabel="Entfernen"
          onCancel={() => setEntfernenFragen(false)}
          onConfirm={() => {
            setEntfernenFragen(false);
            setFehler(null);
            void entfernen()
              .then(() => zeige({ text: 'Die KI ist entfernt.' }))
              .catch(fang);
          }}
        />
      )}
    </>
  );
};

const KiFormular = ({
  vorher,
  fertig,
}: {
  vorher: KiEinstellung | null;
  fertig: () => void;
}) => {
  const [anbieter, setAnbieter] = useState<KiAnbieter>(
    (vorher?.anbieter as KiAnbieter | undefined) ?? 'anthropic',
  );
  const bekannt = (wert: KiAnbieter, modell: string) =>
    KI_MODELLE[wert].some((eintrag) => eintrag.kennung === modell);
  const [modell, setModell] = useState(
    vorher === null
      ? STANDARD_MODELL.anthropic
      : bekannt(vorher.anbieter as KiAnbieter, vorher.modell)
        ? vorher.modell
        : ANDERES,
  );
  const [eigenes, setEigenes] = useState(
    vorher !== null && !bekannt(vorher.anbieter as KiAnbieter, vorher.modell)
      ? vorher.modell
      : '',
  );
  const [schluessel, setSchluessel] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [einrichten, { loading }] = useMutation(KI_EINRICHTEN, {
    refetchQueries: [KI_EINSTELLUNG],
  });
  const id = useId();
  const anleitung = ANLEITUNG[anbieter];
  const gewaehlt = modell === ANDERES ? eigenes.trim() : modell;
  const schluesselNoetig = vorher === null || vorher.anbieter !== anbieter;

  return (
    <form
      className="ki-formular"
      onSubmit={(event) => {
        event.preventDefault();
        setFehler(null);
        void einrichten({
          variables: {
            input: {
              anbieter,
              modell: gewaehlt,
              schluessel: schluessel.trim() === '' ? null : schluessel.trim(),
            },
          },
        })
          .then(() => {
            setSchluessel('');
            fertig();
          })
          .catch((problem: unknown) =>
            setFehler(problem instanceof Error ? problem.message : 'Fehler.'),
          );
      }}
    >
      <fieldset className="ki-formular__anbieter">
        <legend>Anbieter</legend>
        {KI_ANBIETER.map((eintrag) => (
          <label key={eintrag.wert} className="checkbox-field">
            <input
              type="radio"
              name={`${id}-anbieter`}
              value={eintrag.wert}
              checked={anbieter === eintrag.wert}
              onChange={() => {
                setAnbieter(eintrag.wert);
                setModell(STANDARD_MODELL[eintrag.wert]);
              }}
            />
            {eintrag.name}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-modell`}>Modell</label>
        <select
          id={`${id}-modell`}
          value={modell}
          onChange={(event) => setModell(event.target.value)}
        >
          {KI_MODELLE[anbieter].map((eintrag) => (
            <option key={eintrag.kennung} value={eintrag.kennung}>
              {eintrag.name} — {eintrag.hinweis}
            </option>
          ))}
          <option value={ANDERES}>Anderes Modell …</option>
        </select>
      </div>

      {modell === ANDERES && (
        <div className="field">
          <label htmlFor={`${id}-eigenes`}>Modellkennung beim Anbieter</label>
          <input
            id={`${id}-eigenes`}
            value={eigenes}
            maxLength={80}
            spellCheck={false}
            onChange={(event) => setEigenes(event.target.value)}
          />
        </div>
      )}

      <div className="buchhaltung-anleitung">
        <h3>So erhalten Sie den Schlüssel</h3>
        <ol>
          {anleitung.schritte.map((schritt) => (
            <li key={schritt}>{schritt}</li>
          ))}
        </ol>
        <p>
          <a
            href={anleitung.link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {anleitung.link.text}
          </a>
        </p>
      </div>

      <div className="field">
        <label htmlFor={`${id}-schluessel`}>
          API-Schlüssel
          {schluesselNoetig ? '' : ' (leer lassen, um ihn zu behalten)'}
        </label>
        <input
          id={`${id}-schluessel`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={500}
          value={schluessel}
          aria-describedby={`${id}-hinweis`}
          onChange={(event) => setSchluessel(event.target.value)}
        />
        <p id={`${id}-hinweis`} className="field__hint">
          Stegwerk prüft Schlüssel und Modell sofort bei{' '}
          {anbieterName(anbieter)}, ohne dabei etwas zu erzeugen, und speichert
          den Schlüssel verschlüsselt. Angezeigt wird er danach nie wieder.
        </p>
      </div>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      <div>
        <button
          type="submit"
          className="button"
          disabled={
            loading ||
            gewaehlt === '' ||
            (schluesselNoetig && schluessel.trim() === '')
          }
        >
          {loading ? 'Wird geprüft …' : 'Prüfen und speichern'}
        </button>
      </div>
    </form>
  );
};
