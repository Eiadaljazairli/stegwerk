import { Link } from 'react-router-dom';

import { IconSettings } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { useEinstellungen } from '../lib/useEinstellungen';

export const EinstellungenPage = () => {
  const gruppen = useEinstellungen();

  return (
    <>
      <ObjectHeader
        hilfe="einstellungen"
        kind="data"
        icon={IconSettings}
        label="Einstellungen"
        title="Alles an einem Ort"
        note="Auch über die Suche (Strg K) zu finden."
      />

      <div className="einstellungen">
        {gruppen.map((gruppe, index) => (
          <section
            key={gruppe.titel}
            className="card einstellungen__gruppe"
            aria-labelledby={`einstellungen-${String(index)}`}
          >
            <h2 id={`einstellungen-${String(index)}`}>{gruppe.titel}</h2>
            <ul className="einstellungen__liste">
              {gruppe.eintraege.map((eintrag) => (
                <li key={`${eintrag.to}-${eintrag.titel}`}>
                  <Link to={eintrag.to} className="einstellungen__eintrag">
                    <span className="einstellungen__titel">
                      {eintrag.titel}
                    </span>
                    <span className="einstellungen__beschreibung">
                      {eintrag.beschreibung}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
};
