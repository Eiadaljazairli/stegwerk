import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import { SICHERHEIT } from '../lib/queries';
import { type Sicherheit } from '../lib/types';

const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });

export const UnterauftragsverarbeiterPage = () => {
  const { data, loading } = useQuery<{ sicherheit: Sicherheit }>(SICHERHEIT);
  const s = data?.sicherheit;

  return (
    <OeffentlicheSeite
      titel="Unterauftragsverarbeiter"
      untertitel="Wer außer uns Daten verarbeitet"
      beschreibung="Liste der weiteren Auftragsverarbeiter von Stegwerk nach Art. 28 DSGVO, mit Stand der letzten Änderung."
    >
      {loading || s === undefined ? (
        <p className="auth__subtitle">Wird geladen…</p>
      ) : (
        <>
          <p className="field__hint">
            Stand: {DATUM.format(new Date(`${s.unterauftragStand}T12:00:00`))}
          </p>

          {s.unterauftragsverarbeiter.length === 0 ? (
            <p>
              In dieser Installation ist kein weiterer Auftragsverarbeiter
              eingebunden.
            </p>
          ) : (
            <ul className="legal-page__list">
              {s.unterauftragsverarbeiter.map((zeile) => (
                <li key={zeile}>{zeile}</li>
              ))}
            </ul>
          )}

          <p>
            Diese Liste ist Anlage 3 des{' '}
            <Link to="/auftragsverarbeitung">
              Vertrags zur Auftragsverarbeitung
            </Link>
            . Wechsel oder Hinzunahme teilen wir rechtzeitig in Textform mit;
            Sie können innerhalb von 14 Tagen aus wichtigem
            datenschutzrechtlichem Grund widersprechen.
          </p>
        </>
      )}
    </OeffentlicheSeite>
  );
};
