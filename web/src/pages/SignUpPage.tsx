import { useMutation } from '@apollo/client';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { NACHWEIS_KOPF } from '../lib/arbeitsnachweis';
import { useAuth } from '../lib/auth';
import { useArbeitsnachweis } from '../lib/useArbeitsnachweis';
import { SIGN_UP } from '../lib/queries';
import { type StoredSession } from '../lib/session';
import { ohneSsoParameter, ssoRueckmeldung } from '../lib/sso';
import { Wordmark } from '../components/Wordmark';
import { SsoKnoepfe } from '../components/SsoKnoepfe';

export const SignUpPage = () => {
  const { startSession } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    workspaceName: '',
  });

  const [signUp, { loading, error }] = useMutation<{ signUp: StoredSession }>(
    SIGN_UP,
  );
  const nachweis = useArbeitsnachweis();
  const [prueft, setPrueft] = useState(false);
  const [nachweisFehler, setNachweisFehler] = useState<string | null>(null);
  const [ssoMeldung] = useState(() => ssoRueckmeldung(window.location.search));
  const bereichFeld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { pathname, search } = window.location;
    const rest = ohneSsoParameter(search);

    if (rest !== search) {
      window.history.replaceState(
        window.history.state,
        '',
        `${pathname}${rest}`,
      );
    }
  }, []);

  const updateField = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

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

    const result = await signUp({
      variables: { input: form },
      context: { headers: { [NACHWEIS_KOPF]: kopf } },
    }).catch(() => null);

    if (result?.data?.signUp !== undefined) {
      startSession(result.data.signUp);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">Konto erstellen</div>
        <p className="auth__subtitle">
          Legen Sie Ihren Arbeitsbereich in einer Minute an.
        </p>

        {error !== undefined && (
          <div className="error-banner">{error.message}</div>
        )}
        {ssoMeldung?.art === 'fehler' && (
          <div className="error-banner" role="alert">
            {ssoMeldung.text}
          </div>
        )}
        {nachweisFehler !== null && (
          <div className="error-banner" role="alert">
            {nachweisFehler}
          </div>
        )}

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="workspaceName">Arbeitsbereich</label>
            <input
              id="workspaceName"
              ref={bereichFeld}
              required
              placeholder="z. B. Nordwind GmbH"
              value={form.workspaceName}
              onChange={(event) =>
                updateField('workspaceName')(event.target.value)
              }
            />
          </div>

          <SsoKnoepfe
            zweck="registrieren"
            arbeitsbereich={form.workspaceName}
            nachweis={nachweis}
            beiFehlendemBereich={() => bereichFeld.current?.focus()}
          />

          <div className="field">
            <label htmlFor="firstName">Vorname</label>
            <input
              id="firstName"
              required
              value={form.firstName}
              onChange={(event) => updateField('firstName')(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="lastName">Nachname</label>
            <input
              id="lastName"
              required
              value={form.lastName}
              onChange={(event) => updateField('lastName')(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="signup-email">E-Mail</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => updateField('email')(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="signup-password">Passwort (min. 12 Zeichen)</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={form.password}
              onChange={(event) => updateField('password')(event.target.value)}
            />
          </div>

          <button
            className="button"
            type="submit"
            disabled={loading || prueft}
            aria-describedby="signup-nachweis"
          >
            {prueft
              ? 'Wird geprüft …'
              : loading
                ? 'Wird erstellt…'
                : 'Konto erstellen'}
          </button>
          <p className="auth__hint" id="signup-nachweis">
            Zum Schutz vor Programmen rechnet Ihr Browser vor dem Absenden kurz
            eine Aufgabe, ganz ohne Bilderrätsel und ohne fremden Dienst.
          </p>
        </form>

        <p className="auth__switch">
          Bereits registriert? <Link to="/anmelden">Anmelden</Link>
        </p>
      </div>
    </div>
  );
};
