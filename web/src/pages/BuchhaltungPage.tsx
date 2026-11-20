import { useMutation, useQuery } from '@apollo/client';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconInvoices } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  ANBIETER,
  type Anbieter,
  ANLEITUNG,
  anbieterName,
} from '../lib/buchhaltung';
import {
  BUCHHALTUNG_EINSTELLEN,
  BUCHHALTUNG_STAND,
  BUCHHALTUNG_TRENNEN,
  BUCHHALTUNG_VERBINDEN,
  BUCHHALTUNG_VERBINDUNG,
  OFFENE_AN_BUCHHALTUNG,
} from '../lib/queries';
import { type BuchhaltungVerbindung, formatDate } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';

export const BuchhaltungPage = () => {
  const { can, loading: rechteLaden } = usePermissions();
  const verwalten =
    can('workspace:api') && can('invoice:view') && can('invoice:write');
  const trennenDarf = can('workspace:api');
  const senden = can('invoice:issue');
  const { data, loading, error } = useQuery<{
    buchhaltungVerbindung: BuchhaltungVerbindung | null;
  }>(BUCHHALTUNG_STAND, { skip: rechteLaden });
  const refetchQueries = [BUCHHALTUNG_STAND, BUCHHALTUNG_VERBINDUNG];
  const [verbinden, { loading: verbindet }] = useMutation(
    BUCHHALTUNG_VERBINDEN,
    { refetchQueries },
  );
  const [einstellen] = useMutation(BUCHHALTUNG_EINSTELLEN, { refetchQueries });
  const [trennen, { loading: trennt }] = useMutation(BUCHHALTUNG_TRENNEN, {
    refetchQueries,
  });
  const [alleSenden, { loading: sendet }] = useMutation<{
    offeneAnBuchhaltung: number;
  }>(OFFENE_AN_BUCHHALTUNG, { refetchQueries });

  const [anbieter, setAnbieter] = useState<Anbieter>('lexware');
  const [schluessel, setSchluessel] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [trennenFragen, setTrennenFragen] = useState(false);
  const [neuVerbinden, setNeuVerbinden] = useState(false);
  const feldId = useId();
  const { zeige } = useToast();
  const setMeldung = (text: string) => zeige({ text });

  if (rechteLaden || (loading && data === undefined)) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const verbindung = data?.buchhaltungVerbindung ?? null;
  const gewaehlt: Anbieter =
    verbindung !== null ? (verbindung.anbieter as Anbieter) : anbieter;
  const anleitung = ANLEITUNG[gewaehlt];

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const absenden = async () => {
    setFehler(null);
    await verbinden({
      variables: {
        input: { anbieter: gewaehlt, schluessel: schluessel.trim() },
      },
    })
      .then(() => {
        setSchluessel('');
        setNeuVerbinden(false);
        setMeldung(`Mit ${anbieterName(gewaehlt)} verbunden.`);
      })
      .catch(fang);
  };

  const schalter = (
    feld: 'automatisch' | 'zahlungenAbgleichen',
    wert: boolean,
  ) => {
    setFehler(null);
    void einstellen({ variables: { input: { [feld]: wert } } }).catch(fang);
  };

  const formular = (
    <form
      className="buchhaltung-formular"
      onSubmit={(event) => {
        event.preventDefault();
        void absenden();
      }}
    >
      {verbindung === null && (
        <fieldset className="buchhaltung-formular__anbieter">
          <legend>Ihr Buchhaltungsprogramm</legend>
          {ANBIETER.map((eintrag) => (
            <label key={eintrag.wert} className="checkbox-field">
              <input
                type="radio"
                name="anbieter"
                value={eintrag.wert}
                checked={anbieter === eintrag.wert}
                onChange={() => setAnbieter(eintrag.wert)}
              />
              {eintrag.name}
            </label>
          ))}
        </fieldset>
      )}

      <div className="buchhaltung-anleitung">
        <h3>So erhalten Sie den Schlüssel</h3>
        <ol>
          {anleitung.schritte.map((schritt) => (
            <li key={schritt}>{schritt}</li>
          ))}
        </ol>
        {anleitung.link !== null && (
          <p>
            <a
              href={anleitung.link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {anleitung.link.text}
            </a>
          </p>
        )}
        <p className="field__hint">{anleitung.hinweis}</p>
      </div>

      <div className="field">
        <label htmlFor={feldId}>{anleitung.feld}</label>
        <input
          id={feldId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={500}
          value={schluessel}
          aria-describedby={`${feldId}-hinweis`}
          onChange={(event) => setSchluessel(event.target.value)}
        />
        <p id={`${feldId}-hinweis`} className="field__hint">
          Stegwerk prüft den Schlüssel sofort bei {anbieterName(gewaehlt)} und
          speichert ihn verschlüsselt. Angezeigt wird er danach nie wieder.
        </p>
      </div>

      <div>
        <button
          type="submit"
          className="button"
          disabled={verbindet || schluessel.trim() === ''}
        >
          {verbindet
            ? 'Wird geprüft …'
            : verbindung === null
              ? `Mit ${anbieterName(gewaehlt)} verbinden`
              : 'Neu verbinden'}
        </button>
      </div>
    </form>
  );

  return (
    <>
      <ObjectHeader
        hilfe="buchhaltung"
        kind="invoice"
        icon={IconInvoices}
        label="Einstellungen"
        title="Buchhaltung"
        note="Gestellte Rechnungen gehen als Beleg mit PDF an Lexware Office oder sevDesk, mit Ihrem eigenen API-Schlüssel. Rechnungsnummern und E-Rechnung bleiben in Stegwerk."
      />

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {verbindung === null ? (
        <section className="card buchhaltung-seite">
          <h2>Noch nicht verbunden</h2>
          {verwalten ? (
            formular
          ) : (
            <p>
              Verbinden darf, wessen Rolle API-Schlüssel und Webhooks verwaltet
              und alle Rechnungen sehen und bearbeiten darf. Wenden Sie sich an
              eine Person mit Administratorrechten.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="card buchhaltung-seite">
            <h2>Verbunden mit {anbieterName(verbindung.anbieter)}</h2>
            <dl className="buchhaltung-seite__stand">
              <div>
                <dt>Verbunden seit</dt>
                <dd>{formatDate(verbindung.createdAt)}</dd>
              </div>
              <div>
                <dt>Konto</dt>
                <dd>
                  {verbindung.kontoName ?? anbieterName(verbindung.anbieter)}
                </dd>
              </div>
              <div>
                <dt>Unterwegs</dt>
                <dd>{verbindung.wartend ?? 0}</dd>
              </div>
              <div>
                <dt>Mit Fehler</dt>
                <dd>{verbindung.fehlerhaft ?? 0}</dd>
              </div>
            </dl>

            {verbindung.fehlerZeigen && verbindung.anmeldungFehler !== null && (
              <div className="banner banner--warning" role="alert">
                <span>
                  {verbindung.anmeldungFehler} Geben Sie unten einen neuen
                  Schlüssel ein.
                </span>
              </div>
            )}

            {verwalten && (
              <>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={verbindung.automatisch}
                    onChange={(event) =>
                      schalter('automatisch', event.target.checked)
                    }
                  />
                  Gestellte Rechnungen und Stornos von selbst übertragen
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={verbindung.zahlungenAbgleichen}
                    onChange={(event) =>
                      schalter('zahlungenAbgleichen', event.target.checked)
                    }
                  />
                  Rechnungen als bezahlt buchen, sobald{' '}
                  {anbieterName(verbindung.anbieter)} sie bezahlt meldet
                </label>
              </>
            )}

            {senden &&
              (verbindung.nichtUebertragen ?? 0) +
                (verbindung.fehlerhaft ?? 0) >
                0 && (
                <div className="buchhaltung-seite__sammel">
                  <p>
                    {verbindung.nichtUebertragen ?? 0} gestellte Rechnungen
                    wurden noch nie übertragen
                    {(verbindung.fehlerhaft ?? 0) > 0
                      ? `, ${String(verbindung.fehlerhaft)} stehen mit Fehler`
                      : ''}
                    .
                  </p>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={sendet}
                    onClick={() => {
                      setFehler(null);
                      void alleSenden()
                        .then((ergebnis) =>
                          setMeldung(
                            `${String(ergebnis.data?.offeneAnBuchhaltung ?? 0)} Rechnungen werden übertragen.`,
                          ),
                        )
                        .catch(fang);
                    }}
                  >
                    {sendet
                      ? 'Wird eingereiht …'
                      : 'Noch nicht übertragene senden'}
                  </button>
                </div>
              )}

            {trennenDarf && (
              <div className="buchhaltung-seite__aktionen">
                {verwalten && (
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => setNeuVerbinden(!neuVerbinden)}
                    aria-expanded={neuVerbinden}
                  >
                    Neuen Schlüssel eingeben
                  </button>
                )}
                <button
                  type="button"
                  className="button button--danger"
                  disabled={trennt}
                  onClick={() => setTrennenFragen(true)}
                >
                  Trennen
                </button>
              </div>
            )}
          </section>

          {verwalten && (neuVerbinden || verbindung.fehlerZeigen) && (
            <section className="card buchhaltung-seite">
              <h2>Neu verbinden</h2>
              {formular}
            </section>
          )}
        </>
      )}

      <section className="card buchhaltung-seite">
        <h2>Was übertragen wird</h2>
        <ul className="buchhaltung-seite__liste">
          <li>
            Jede gestellte Rechnung als Beleg (Ausgangsrechnung) mit Nummer,
            Datum, Leistungsdatum, Fälligkeit und den Beträgen je Steuersatz,
            dazu das PDF; mit vollständigem Briefkopf ist es eine E-Rechnung
            (ZUGFeRD).
          </li>
          <li>
            Der Kunde: die Firma der Rechnung, sonst der Kontakt. Gibt es ihn
            beim Anbieter schon mit genau diesem Namen, wird er verknüpft, sonst
            angelegt. Ohne Firma und Kontakt geht der Beleg an den Sammelkunden.
            Bei sevDesk wird ein neuer Kunde ohne Anschrift und Mail angelegt;
            die stehen auf dem PDF.
          </li>
          <li>
            Eine sonstige Leistung an ein Unternehmen im EU-Ausland (Reverse
            Charge nach § 18b UStG) nimmt sevDesk über die Schnittstelle nicht
            an. Solche Rechnungen bitte dort von Hand erfassen; Stegwerk sagt es
            an der Rechnung.
          </li>
          <li>
            Ein Storno als Rechnungskorrektur zur ursprünglichen Rechnung: bei
            Lexware Office als Gutschrift-Beleg, bei sevDesk als Beleg mit
            negativen Beträgen.
          </li>
          <li>
            Zurück kommt nur, ob ein Beleg bezahlt ist. Belege aus der
            Buchhaltung holt Stegwerk nicht.
          </li>
        </ul>
        <p className="field__hint">
          Den Stand jeder Rechnung sehen Sie in der Rechnung selbst. Mehr dazu
          in der <Link to="/hilfe#buchhaltung">Hilfe</Link>.
        </p>
      </section>

      {trennenFragen && verbindung !== null && (
        <ConfirmDialog
          title={`${anbieterName(verbindung.anbieter)} trennen?`}
          consequence="Der Schlüssel wird gelöscht. Was schon übertragen ist, bleibt dort und an der Rechnung vermerkt; was noch unterwegs war, geht nicht mehr hinaus."
          confirmLabel="Trennen"
          onCancel={() => setTrennenFragen(false)}
          onConfirm={() => {
            setTrennenFragen(false);
            setFehler(null);
            void trennen()
              .then(() => setMeldung('Die Buchhaltung ist getrennt.'))
              .catch(fang);
          }}
        />
      )}
    </>
  );
};
