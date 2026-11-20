import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  CALENDAR_FEED_URL,
  DISABLE_CALENDAR_FEED,
  ENABLE_CALENDAR_FEED,
} from '../lib/queries';
import { AbhilfeLink } from './AbhilfeLink';
import { Dialogfenster } from './Dialogfenster';

export const CalendarFeedButton = () => {
  const [offen, setOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const { data } = useQuery<{ calendarFeedUrl: string | null }>(
    CALENDAR_FEED_URL,
    { skip: !offen },
  );
  const refetchQueries = [{ query: CALENDAR_FEED_URL }];
  const [einschalten, { loading }] = useMutation(ENABLE_CALENDAR_FEED, {
    refetchQueries,
  });
  const [ausschalten] = useMutation(DISABLE_CALENDAR_FEED, {
    refetchQueries,
  });

  const link = data?.calendarFeedUrl ?? null;
  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const kopieren = async () => {
    if (link === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {}
  };

  return (
    <div className="datev">
      <button
        type="button"
        className="button button--ghost"
        aria-haspopup="dialog"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        Abonnieren
      </button>

      {offen && (
        <Dialogfenster
          titel="Kalender abonnieren"
          breit
          onClose={() => setOffen(false)}
        >
          <p className="field__hint">
            Ihre Termine erscheinen in Outlook, Google Kalender oder auf dem
            iPhone und bleiben dort aktuell. Änderungen dort kommen nicht
            hierher zurück.
          </p>

          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
            </div>
          )}

          {link === null ? (
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={() => void einschalten().catch(fang)}
            >
              Abo-Link erzeugen
            </button>
          ) : (
            <>
              <div className="quote-link__row">
                <input
                  className="quote-link__url"
                  readOnly
                  value={link}
                  aria-label="Abo-Link"
                  onFocus={(event) => event.target.select()}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => void kopieren()}
                >
                  {kopiert ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
              <ul className="calendar-feed__how">
                <li>
                  <strong>Outlook:</strong> Kalender hinzufügen → Aus dem
                  Internet abonnieren
                </li>
                <li>
                  <strong>Google:</strong> Weitere Kalender → Per URL
                </li>
                <li>
                  <strong>iPhone:</strong> Einstellungen → Kalender → Accounts →
                  Kalenderabo hinzufügen
                </li>
              </ul>
              <p className="field__hint">
                Der Link zeigt Ihre Termine ohne Anmeldung. Geben Sie ihn nicht
                weiter; ist er in falsche Hände geraten, erzeugen Sie einen
                neuen. Neue Termine erscheinen erst, wenn Ihr Kalenderprogramm
                das Abo das nächste Mal abholt.
                <AbhilfeLink id="kalender-abo" />
              </p>
              <div className="calendar-feed__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    void einschalten({ variables: { renew: true } }).catch(fang)
                  }
                >
                  Neuen Link erzeugen
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => void ausschalten().catch(fang)}
                >
                  Abo beenden
                </button>
              </div>
            </>
          )}
        </Dialogfenster>
      )}
    </div>
  );
};
