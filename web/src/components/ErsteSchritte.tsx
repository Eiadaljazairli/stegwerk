import { gql, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { IconCheck } from './Icons';

const ERSTE_SCHRITTE = gql`
  query ErsteSchritte {
    ersteSchritte {
      briefkopf
      kontakte
      geschaeft
      team
      angebot
      zweiFaktor
      postfach
    }
  }
`;

type Stand = Record<
  | 'briefkopf'
  | 'kontakte'
  | 'geschaeft'
  | 'team'
  | 'angebot'
  | 'zweiFaktor'
  | 'postfach',
  boolean
>;

const SCHRITTE: {
  schluessel: keyof Stand;
  titel: string;
  warum: string;
  ziel: string;
  knopf: string;
}[] = [
  {
    schluessel: 'briefkopf',
    titel: 'Briefkopf ausfüllen',
    warum:
      'Anschrift, Steuernummer und Bankverbindung stehen auf jedem Angebot und jeder Rechnung.',
    ziel: '/briefkopf',
    knopf: 'Zum Briefkopf',
  },
  {
    schluessel: 'kontakte',
    titel: 'Kontakte übernehmen',
    warum: 'Aus Ihrem bisherigen Programm als CSV-Datei, oder einzeln anlegen.',
    ziel: '/import',
    knopf: 'Importieren',
  },
  {
    schluessel: 'geschaeft',
    titel: 'Erstes Geschäft anlegen',
    warum:
      'Jede Verkaufschance als Karte auf dem Board, von Erstgespräch bis Gewonnen.',
    ziel: '/geschaefte?neu',
    knopf: 'Geschäft anlegen',
  },
  {
    schluessel: 'angebot',
    titel: 'Erstes Angebot schreiben',
    warum: 'Mit Ihrem Briefkopf als PDF; der Kunde kann es online annehmen.',
    ziel: '/angebote?neu',
    knopf: 'Angebot schreiben',
  },
  {
    schluessel: 'team',
    titel: 'Team einladen',
    warum: 'Jede Person mit eigener Anmeldung und passender Rolle.',
    ziel: '/team?neu',
    knopf: 'Einladen',
  },
  {
    schluessel: 'zweiFaktor',
    titel: 'Zwei-Faktor-Anmeldung einschalten',
    warum:
      'Ein Code aus der App zusätzlich zum Passwort schützt die Kundendaten.',
    ziel: '/team',
    knopf: 'Einschalten',
  },
  {
    schluessel: 'postfach',
    titel: 'Postfach verbinden',
    warum:
      'Mails von und an Kunden erscheinen dann von selbst bei Firma und Kontakt.',
    ziel: '/postfach',
    knopf: 'Verbinden',
  },
];

export const ErsteSchritte = () => {
  const { session } = useAuth();
  const schluessel = `stegwerk.ersteSchritte.aus.${session?.workspace.id ?? ''}`;
  const [aus, setAus] = useState(() => {
    try {
      return window.localStorage.getItem(schluessel) === '1';
    } catch {
      return false;
    }
  });
  const { data } = useQuery<{ ersteSchritte: Stand }>(ERSTE_SCHRITTE, {
    fetchPolicy: 'cache-and-network',
    skip: aus,
  });
  const stand = data?.ersteSchritte;

  if (aus || stand === undefined) {
    return null;
  }

  const erledigt = SCHRITTE.filter((s) => stand[s.schluessel]).length;

  if (erledigt === SCHRITTE.length) {
    return null;
  }

  const ausblenden = () => {
    setAus(true);

    try {
      window.localStorage.setItem(schluessel, '1');
    } catch {}
  };

  return (
    <section
      className="card erste-schritte"
      aria-labelledby="erste-schritte-titel"
    >
      <div className="erste-schritte__kopf">
        <div>
          <h2 id="erste-schritte-titel">Erste Schritte</h2>
          <p className="field__hint">
            {erledigt} von {SCHRITTE.length} erledigt
          </p>
        </div>
        <button
          type="button"
          className="button button--ghost"
          onClick={ausblenden}
        >
          Ausblenden
        </button>
      </div>
      <div
        className="erste-schritte__fortschritt"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={SCHRITTE.length}
        aria-valuenow={erledigt}
        aria-label="Fortschritt"
      >
        <span style={{ width: `${(erledigt / SCHRITTE.length) * 100}%` }} />
      </div>
      <ol className="erste-schritte__liste">
        {SCHRITTE.map((schritt) => {
          const fertig = stand[schritt.schluessel];

          return (
            <li
              key={schritt.schluessel}
              className={fertig ? 'is-done' : undefined}
            >
              <span className="erste-schritte__haken" aria-hidden="true">
                {fertig && <IconCheck size={14} />}
              </span>
              <span className="erste-schritte__text">
                <strong>{schritt.titel}</strong>
                {!fertig && (
                  <span className="field__hint">{schritt.warum}</span>
                )}
              </span>
              {fertig ? (
                <span className="field__hint">Erledigt</span>
              ) : (
                <Link className="button button--ghost" to={schritt.ziel}>
                  {schritt.knopf}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <p className="field__hint">
        Erst ausprobieren?{' '}
        <Link to="/team#beispieldaten">Beispieldaten laden</Link> und mit einem
        Klick wieder entfernen, oder eine Branchenvorlage anwenden.
      </p>
    </section>
  );
};
