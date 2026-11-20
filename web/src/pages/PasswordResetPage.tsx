import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RESET_PASSWORD } from '../lib/queries';
import { Wordmark } from '../components/Wordmark';

const MINIMUM_LENGTH = 12;

export const PasswordResetPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);

  const [reset, { loading, error }] = useMutation(RESET_PASSWORD);

  const tooShort = password.length > 0 && password.length < MINIMUM_LENGTH;
  const mismatched = repeat.length > 0 && password !== repeat;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (token === undefined || tooShort || mismatched) {
      return;
    }

    const result = await reset({ variables: { token, password } }).catch(
      () => null,
    );

    if (result?.data?.resetPassword === true) {
      setDone(true);
    }
  };

  if (done) {
    return (
      <div className="auth">
        <div className="auth__card">
          <div className="auth__brand">
            <Wordmark size={20} />
          </div>

          <div className="auth__title">Passwort geändert</div>
          <p className="auth__subtitle">
            Alle bisherigen Anmeldungen wurden beendet. Melden Sie sich mit dem
            neuen Passwort an.
          </p>

          <button
            className="button"
            type="button"
            onClick={() => navigate('/anmelden')}
          >
            Zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">Neues Passwort festlegen</div>
        <p className="auth__subtitle">
          Mindestens {MINIMUM_LENGTH} Zeichen. Der Link funktioniert nur einmal.
        </p>

        {error !== undefined && (
          <div className="error-banner">{error.message}</div>
        )}

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">Neues Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {tooShort && (
              <span className="field__error">
                Noch {MINIMUM_LENGTH - password.length} Zeichen
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="repeat">Passwort wiederholen</label>
            <input
              id="repeat"
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
            {mismatched && (
              <span className="field__error">
                Die beiden Eingaben stimmen nicht überein
              </span>
            )}
          </div>

          <button
            className="button"
            type="submit"
            disabled={loading || tooShort || mismatched || password === ''}
          >
            {loading ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>

        <div className="auth__footer">
          <Link to="/passwort-vergessen">Neuen Link anfordern</Link>
        </div>
      </div>
    </div>
  );
};
