import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import { useAuth } from '../lib/auth';
import {
  alsGesehenMerken,
  NEUIGKEITEN,
  neuesteNeuigkeit,
} from '../lib/neuigkeiten';

const DATUM = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });

export const NeuigkeitenPage = () => {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (userId !== undefined) {
      alsGesehenMerken(userId, neuesteNeuigkeit(NEUIGKEITEN));
      window.dispatchEvent(new Event('stegwerk:neuigkeiten'));
    }
  }, [userId]);

  return (
    <OeffentlicheSeite
      titel="Neuigkeiten"
      untertitel="Was sich in Stegwerk geändert hat"
      beschreibung="Änderungsprotokoll von Stegwerk: neue Funktionen und Verbesserungen, neueste zuerst."
    >
      <div className="neuigkeiten">
        {NEUIGKEITEN.map((eintrag) => (
          <article key={eintrag.id} className="neuigkeiten__eintrag">
            <time dateTime={eintrag.datum} className="neuigkeiten__datum">
              {DATUM.format(new Date(`${eintrag.datum}T12:00:00`))}
            </time>
            <h2>{eintrag.titel}</h2>
            <ul className="legal-page__list">
              {eintrag.punkte.map((punkt) => (
                <li key={punkt}>{punkt}</li>
              ))}
            </ul>
            {eintrag.hilfe !== undefined && userId !== undefined && (
              <Link to={`/hilfe#${eintrag.hilfe}`}>Im Handbuch nachlesen</Link>
            )}
          </article>
        ))}
      </div>
    </OeffentlicheSeite>
  );
};
