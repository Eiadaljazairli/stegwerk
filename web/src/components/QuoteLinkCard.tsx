import { useMutation } from '@apollo/client';
import { useState } from 'react';

import { CREATE_QUOTE_LINK, REVOKE_QUOTE_LINK } from '../lib/queries';
import { formatDate, type Quote } from '../lib/types';

export const QuoteLinkCard = ({ quote }: { quote: Quote }) => {
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [erzeugen, { loading: erzeugt }] = useMutation(CREATE_QUOTE_LINK);
  const [zurueckziehen] = useMutation(REVOKE_QUOTE_LINK);

  const fang = (problem: unknown) =>
    setFehler(
      problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
    );

  const kopieren = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {}
  };

  const entschieden =
    quote.decidedOnline && quote.decidedAt !== null ? (
      <p className="quote-link__decided">
        {quote.status === 'ACCEPTED' ? 'Online angenommen' : 'Online abgelehnt'}{' '}
        von <strong>{quote.decidedByName}</strong> am{' '}
        {formatDate(quote.decidedAt.slice(0, 10))}.
      </p>
    ) : null;

  return (
    <section className="card quote-link">
      <h2>Online-Annahme</h2>

      {entschieden}

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {quote.publicLink === null ? (
        <>
          <p className="field__hint">
            Ein Link, über den Ihr Kunde das Angebot ansieht, als PDF lädt und
            mit seinem Namen annimmt oder ablehnt, ohne Konto. Sie bekommen eine
            Mail, sobald er entschieden hat.
          </p>
          <button
            type="button"
            className="button button--ghost"
            disabled={erzeugt}
            onClick={() =>
              void erzeugen({ variables: { id: quote.id } }).catch(fang)
            }
          >
            Link für den Kunden erzeugen
          </button>
        </>
      ) : (
        <>
          <div className="quote-link__row">
            <input
              className="quote-link__url"
              readOnly
              value={quote.publicLink}
              aria-label="Link für den Kunden"
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              className="button"
              onClick={() => void kopieren(quote.publicLink ?? '')}
            >
              {kopiert ? 'Kopiert' : 'Kopieren'}
            </button>
            <a
              className="button button--ghost"
              href={quote.publicLink}
              target="_blank"
              rel="noreferrer"
            >
              Ansehen
            </a>
          </div>
          <button
            type="button"
            className="button button--danger"
            onClick={() =>
              void zurueckziehen({ variables: { id: quote.id } }).catch(fang)
            }
          >
            Link zurückziehen
          </button>
        </>
      )}
    </section>
  );
};
