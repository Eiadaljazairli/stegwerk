import { getLastEventId } from '../lib/sentry';
import { Wordmark } from './Wordmark';

type AppErrorFallbackProps = {
  resetError: () => void;
};

export const AppErrorFallback = ({ resetError }: AppErrorFallbackProps) => {
  const reference = getLastEventId();

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">Etwas ist schiefgelaufen</div>
        <p className="auth__subtitle">
          Die Ansicht konnte nicht geladen werden. Ihre Daten sind davon nicht
          betroffen.
        </p>

        <div className="auth__actions">
          <button className="button" type="button" onClick={resetError}>
            Erneut versuchen
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => window.location.assign('/')}
          >
            Zur Startseite
          </button>
        </div>

        {reference !== undefined && (
          <p className="auth__hint">
            Bei Rückfragen bitte diese Kennung angeben:{' '}
            <code className="auth__code">{reference}</code>
          </p>
        )}
      </div>
    </div>
  );
};
