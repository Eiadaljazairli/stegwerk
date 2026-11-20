import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { NACHWEIS_KOPF } from '../lib/arbeitsnachweis';
import { REQUEST_PASSWORD_RESET } from '../lib/queries';
import { useArbeitsnachweis } from '../lib/useArbeitsnachweis';
import { Wordmark } from '../components/Wordmark';

export const PasswordResetRequestPage = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const [request, { loading, error }] = useMutation(REQUEST_PASSWORD_RESET);
  const nachweis = useArbeitsnachweis();
  const [prueft, setPrueft] = useState(false);
  const [nachweisFehler, setNachweisFehler] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setNachweisFehler(null);
    setPrueft(true);

    let kopf: string;

    try {
      kopf = await nachweis();
    } catch (problem) {
      setNachweisFehler(problem instanceof Error ? problem.message : 'Fehler.');

      return;
    } finally {
      setPrueft(false);
    }

    const result = await request({
      variables: { email },
      context: { headers: { [NACHWEIS_KOPF]: kopf } },
    }).catch(() => null);

    if (result !== null) {
      setSent(true);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        {sent ? (
          <>
            <div className="auth__title">E-Mail unterwegs</div>
            <p className="auth__subtitle">
              Falls für <strong>{email}</strong> ein Konto besteht, ist ein Link
              zum Zurücksetzen unterwegs. Er ist eine Stunde gültig.
            </p>
            <p className="auth__hint">
              Nichts angekommen? Sehen Sie im Spam-Ordner nach, oder fordern Sie
              in einer Minute einen neuen Link an.
            </p>
            <div className="auth__footer">
              <Link to="/anmelden">Zurück zur Anmeldung</Link>
            </div>
          </>
        ) : (
          <>
            <div className="auth__title">Passwort vergessen</div>
            <p className="auth__subtitle">
              Geben Sie Ihre E-Mail-Adresse ein. Wir schicken Ihnen einen Link,
              mit dem Sie ein neues Passwort festlegen.
            </p>

            {error !== undefined && (
              <div className="error-banner">{error.message}</div>
            )}
            {nachweisFehler !== null && (
              <div className="error-banner" role="alert">
                {nachweisFehler}
              </div>
            )}

            <form className="auth__form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="email">E-Mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <button
                className="button"
                type="submit"
                disabled={loading || prueft}
              >
                {prueft
                  ? 'Wird geprüft …'
                  : loading
                    ? 'Wird gesendet …'
                    : 'Link anfordern'}
              </button>
            </form>

            <div className="auth__footer">
              <Link to="/anmelden">Zurück zur Anmeldung</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
