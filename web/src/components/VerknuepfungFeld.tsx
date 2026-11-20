import { type ReactNode, useState } from 'react';

import { type AuswahlTreffer } from '../lib/auswahl';
import { type AuswahlArt, DatensatzAuswahl } from './DatensatzAuswahl';

export const VerknuepfungFeld = ({
  label,
  art,
  anzeige,
  belegt,
  darfAendern,
  onWaehlen,
  onNeu,
  onEntfernen,
}: {
  label: string;
  art: AuswahlArt;
  anzeige: ReactNode;
  belegt: boolean;
  darfAendern: boolean;
  onWaehlen: (treffer: AuswahlTreffer) => Promise<unknown>;
  onNeu?: (text: string) => Promise<unknown>;
  onEntfernen: () => Promise<unknown>;
}) => {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const entfernen = async () => {
    setFehler(null);

    try {
      await onEntfernen();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');
    }
  };

  return (
    <div className="detail-field">
      <div className="detail-field__label">{label}</div>
      <div className="detail-field__value detail-field__value--static">
        {offen ? (
          <DatensatzAuswahl
            art={art}
            label={`${label} wählen`}
            onWaehlen={async (treffer) => {
              await onWaehlen(treffer);
              setOffen(false);
            }}
            onNeu={
              onNeu === undefined
                ? undefined
                : async (text) => {
                    await onNeu(text);
                    setOffen(false);
                  }
            }
            onAbbrechen={() => setOffen(false)}
          />
        ) : (
          <span className="verknuepfung">
            <span className="verknuepfung__wert">{anzeige}</span>
            {darfAendern && (
              <span className="verknuepfung__aktionen">
                <button
                  type="button"
                  className="feed__link"
                  aria-label={`${label} ${belegt ? 'ändern' : 'wählen'}`}
                  onClick={() => setOffen(true)}
                >
                  {belegt ? 'Ändern' : 'Wählen'}
                </button>
                {belegt && (
                  <button
                    type="button"
                    className="feed__link"
                    aria-label={`${label} entfernen`}
                    onClick={() => void entfernen()}
                  >
                    Entfernen
                  </button>
                )}
              </span>
            )}
          </span>
        )}
        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
          </div>
        )}
      </div>
    </div>
  );
};
