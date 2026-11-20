import { Link } from 'react-router-dom';

import { type LiveObjekt } from '../lib/live';
import { LiveHinweis } from './LiveHinweis';

export const AkteFehlt = ({
  meldung,
  zurueck,
  live,
}: {
  meldung: string;
  zurueck: { to: string; label: string };
  live?: { objekt: LiveObjekt; id: string };
}) => (
  <div className="akte-fehlt">
    {live !== undefined && <LiveHinweis objekt={live.objekt} id={live.id} />}
    <div className="error-banner" role="alert">
      {meldung}
    </div>
    <p className="field__hint">
      Vielleicht wurde der Eintrag gelöscht (Papierkorb) oder Ihre Rolle darf
      ihn nicht sehen.
    </p>
    <div className="row-actions">
      <Link className="button" to={zurueck.to}>
        {zurueck.label}
      </Link>
      <Link className="button button--ghost" to="/papierkorb">
        Zum Papierkorb
      </Link>
    </div>
  </div>
);
