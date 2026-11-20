import { useMutation } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EMAIL_AENDERN_BESTAETIGEN, PROFIL } from '../lib/queries';

export const EmailAendernPage = () => {
  const { token = '' } = useParams();
  const [neu, setNeu] = useState<string | null>(null);
  const [bestaetigen, { loading, error }] = useMutation<{
    emailAendernBestaetigen: string;
  }>(EMAIL_AENDERN_BESTAETIGEN, { refetchQueries: [{ query: PROFIL }] });

  return (
    <section className="card konto email-aendern">
      <h1>Neue Anmelde-Adresse</h1>
      {neu !== null ? (
        <>
          <p>
            Ab sofort melden Sie sich mit <strong>{neu}</strong> an. An die
            bisherige Adresse ist ein Hinweis unterwegs.
          </p>
          <Link className="button" to="/team">
            Zu den Einstellungen
          </Link>
        </>
      ) : (
        <>
          <p>
            Mit dem Knopf übernehmen Sie die neue Adresse für Ihr Konto. Bis
            dahin gilt die bisherige.
          </p>
          {error !== undefined && (
            <div className="error-banner">{error.message}</div>
          )}
          <button
            type="button"
            className="button"
            disabled={loading || token === ''}
            onClick={() =>
              void bestaetigen({ variables: { token } })
                .then((r) => setNeu(r.data?.emailAendernBestaetigen ?? null))
                .catch(() => null)
            }
          >
            Neue Adresse übernehmen
          </button>
        </>
      )}
    </section>
  );
};
