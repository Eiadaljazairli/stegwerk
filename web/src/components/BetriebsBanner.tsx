import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { BETRIEBS_HINWEIS } from '../lib/queries';
import { useNeueFassung } from '../lib/neueFassung';

type Hinweis = {
  id: string | null;
  text: string;
  von: string;
  bis: string | null;
  wartung: boolean;
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const BetriebsBanner = () => {
  const neueFassung = useNeueFassung();
  const [spaeter, setSpaeter] = useState(false);
  const [weg, setWeg] = useState<string | null>(null);
  const { data } = useQuery<{ betriebsHinweis: Hinweis | null }>(
    BETRIEBS_HINWEIS,
    { pollInterval: 5 * 60 * 1000 },
  );
  const hinweis = data?.betriebsHinweis ?? null;
  const kennung =
    hinweis === null ? null : `${hinweis.id ?? ''}${hinweis.text}`;

  return (
    <>
      {hinweis !== null && (hinweis.wartung || weg !== kennung) && (
        <div
          className={`notice betriebs-hinweis${hinweis.wartung ? ' betriebs-hinweis--wartung' : ''}`}
          role={hinweis.wartung ? 'alert' : 'status'}
        >
          <div>
            <strong>{hinweis.wartung ? 'Wartung: ' : 'Hinweis: '}</strong>
            {hinweis.text}
            {hinweis.bis !== null && (
              <span className="betriebs-hinweis__zeit">
                {' '}
                ({ZEIT.format(new Date(hinweis.von))} –{' '}
                {ZEIT.format(new Date(hinweis.bis))})
              </span>
            )}
          </div>
          {!hinweis.wartung && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setWeg(kennung)}
            >
              Ausblenden
            </button>
          )}
        </div>
      )}

      {neueFassung && !spaeter && (
        <div className="notice betriebs-hinweis" role="status">
          <div>
            <strong>Neue Version von Stegwerk.</strong> Speichern Sie offene
            Eingaben, dann laden Sie die Seite neu.
          </div>
          <div className="betriebs-hinweis__knoepfe">
            <button
              type="button"
              className="button button--small"
              onClick={() => window.location.reload()}
            >
              Neu laden
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setSpaeter(true)}
            >
              Später
            </button>
          </div>
        </div>
      )}
    </>
  );
};
