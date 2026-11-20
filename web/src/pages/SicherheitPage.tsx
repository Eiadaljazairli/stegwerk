import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import { SICHERHEIT } from '../lib/queries';
import { type Sicherheit } from '../lib/types';

const zerlegt = (zeile: string): { kopf: string | null; text: string } => {
  const stelle = zeile.indexOf(': ');

  return stelle === -1 || stelle > 60
    ? { kopf: null, text: zeile }
    : { kopf: zeile.slice(0, stelle), text: zeile.slice(stelle + 2) };
};

export const SicherheitPage = () => {
  const { data, loading } = useQuery<{ sicherheit: Sicherheit }>(SICHERHEIT);
  const s = data?.sicherheit;

  return (
    <OeffentlicheSeite
      titel="Sicherheit"
      untertitel="Wie Stegwerk Ihre Daten schützt"
      beschreibung="Technische und organisatorische Maßnahmen von Stegwerk: Verschlüsselung, zweiter Faktor, Rollen- und Feldrechte, Protokolle, Löschfristen und Unterauftragsverarbeiter."
    >
      {loading || s === undefined ? (
        <p className="auth__subtitle">Wird geladen…</p>
      ) : (
        <>
          <p>
            Diese Seite beschreibt, was die Software tatsächlich tut. Dieselben
            Angaben stehen in Anlage 2 des{' '}
            <Link to="/auftragsverarbeitung">
              Vertrags zur Auftragsverarbeitung
            </Link>
            ; ändert sich etwas, ändern sich beide.
          </p>

          {(s.hosting !== null || s.sicherung !== null) && (
            <section>
              <h2>Betrieb</h2>
              {s.hosting !== null && (
                <p>
                  <strong>Standort:</strong> {s.hosting}
                </p>
              )}
              {s.sicherung !== null && (
                <p>
                  <strong>Sicherung:</strong> {s.sicherung}
                </p>
              )}
            </section>
          )}

          <section>
            <h2>Maßnahmen in der Software</h2>
            <ul className="legal-page__list">
              {s.massnahmen.map((zeile) => {
                const { kopf, text } = zerlegt(zeile);

                return (
                  <li key={zeile}>
                    {kopf !== null && <strong>{kopf}: </strong>}
                    {text}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2>Wie lange gespeichert wird</h2>
            <ul className="legal-page__list">
              <li>
                Ihre Inhalte bleiben, solange Ihr Arbeitsbereich besteht; Sie
                können ihn jederzeit vollständig löschen.
              </li>
              {s.loeschfristAktiv && (
                <li>
                  Endet der Zugang, wird der Arbeitsbereich nach{' '}
                  {s.loeschfristTage} Tagen automatisch gelöscht, nach zwei
                  Warnungen vorher.
                </li>
              )}
              <li>
                Das Sicherheitsprotokoll wird nach 12 Monaten gelöscht, die
                Nutzungszahlen je Tag nach 90 Tagen.
              </li>
            </ul>
            <p>
              Einzelheiten stehen in der{' '}
              <Link to="/datenschutz">Datenschutzerklärung</Link>.
            </p>
          </section>

          <section>
            <h2>Wer sonst Daten verarbeitet</h2>
            <p>
              {s.unterauftragsverarbeiter.length === 0
                ? 'In dieser Installation ist kein weiterer Auftragsverarbeiter eingebunden.'
                : `${String(s.unterauftragsverarbeiter.length)} weitere Auftragsverarbeiter sind eingebunden.`}{' '}
              <Link to="/unterauftragsverarbeiter">Zur Liste</Link>
            </p>
          </section>

          {!s.vertragGeprueft && (
            <p className="field__hint">
              Der Vertrag zur Auftragsverarbeitung ist noch nicht rechtlich
              geprüft; die Beschreibung der Maßnahmen gibt den Stand der
              Software wieder.
            </p>
          )}

          <section>
            <h2>Eine Lücke melden</h2>
            <p>
              Haben Sie eine Schwachstelle gefunden, schreiben Sie uns über die
              Angaben auf der <Link to="/kontakt">Kontaktseite</Link>.
            </p>
          </section>
        </>
      )}
    </OeffentlicheSeite>
  );
};
