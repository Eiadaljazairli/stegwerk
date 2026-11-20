import { useMutation } from '@apollo/client';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import { liesWahl, merkeWahl } from '../lib/angemeldetBleiben';
import { useAuth } from '../lib/auth';
import { istGrund } from '../lib/fehlergrund';
import { holeAbmeldegrund } from '../lib/leerlauf';
import { ANMELDUNG_EINLOESEN, SIGN_IN } from '../lib/queries';
import { type StoredSession } from '../lib/session';
import {
  markeAusFragment,
  ohneSsoParameter,
  ssoRueckmeldung,
} from '../lib/sso';
import { Wordmark } from '../components/Wordmark';
import { AbhilfeLink } from '../components/AbhilfeLink';
import { SsoKnoepfe } from '../components/SsoKnoepfe';

const brauchtZweitenFaktor = (fehler: unknown): boolean =>
  istGrund(fehler, 'TWO_FACTOR_REQUIRED');

const SsoAbschluss = ({ marke }: { marke: string }) => {
  const { startSession } = useAuth();
  const [einloesen, { loading }] = useMutation<{
    anmeldungEinloesen: StoredSession;
  }>(ANMELDUNG_EINLOESEN);
  const [fragtNachCode, setFragtNachCode] = useState(false);
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const versuchen = useCallback(
    async (totpCode: string | null) => {
      setFehler(null);

      try {
        const ergebnis = await einloesen({
          variables: { token: marke, totpCode },
        });

        if (ergebnis.data?.anmeldungEinloesen !== undefined) {
          startSession(ergebnis.data.anmeldungEinloesen);
        }
      } catch (problem) {
        if (brauchtZweitenFaktor(problem)) {
          setFragtNachCode(true);

          return;
        }

        setFehler(
          problem instanceof Error
            ? problem.message
            : 'Die Anmeldung ist fehlgeschlagen.',
        );
      }
    },
    [einloesen, marke, startSession],
  );

  const gestartet = useRef(false);

  useEffect(() => {
    if (!gestartet.current) {
      gestartet.current = true;
      void versuchen(null);
    }
  }, [versuchen]);

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">Anmeldung abschließen</div>

        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
            <AbhilfeLink meldung={fehler} />
          </div>
        )}

        {fragtNachCode ? (
          <form
            className="auth__form"
            onSubmit={(ereignis) => {
              ereignis.preventDefault();
              void versuchen(code.trim());
            }}
          >
            <div className="auth__hinweis" role="status">
              Für dieses Konto ist die Zwei-Faktor-Anmeldung eingeschaltet.
            </div>
            <div className="field">
              <label htmlFor="sso-totp">Code aus Ihrer App</label>
              <input
                id="sso-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="123456"
                value={code}
                onChange={(ereignis) => setCode(ereignis.target.value)}
              />
              <p className="field__hint">
                Kein Telefon zur Hand? Einer Ihrer Wiederherstellungscodes geht
                hier auch.
              </p>
            </div>
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        ) : fehler === null ? (
          <p className="auth__subtitle" role="status">
            Einen Moment, Sie werden angemeldet …
          </p>
        ) : null}

        {fehler !== null && (
          <p className="auth__switch">
            <Link to="/anmelden" reloadDocument>
              Zurück zur Anmeldung
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export const SignInPage = () => {
  const [ssoMarke] = useState(() => markeAusFragment(window.location.hash));

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const rest = ohneSsoParameter(search);

    if (rest !== search || hash.startsWith('#sso=')) {
      window.history.replaceState(
        window.history.state,
        '',
        `${pathname}${rest}`,
      );
    }
  }, []);

  return ssoMarke === null ? (
    <Anmeldemaske />
  ) : (
    <SsoAbschluss marke={ssoMarke} />
  );
};

const Anmeldemaske = () => {
  const { startSession } = useAuth();
  const [ssoMeldung] = useState(() => ssoRueckmeldung(window.location.search));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [angemeldetBleiben, setAngemeldetBleiben] = useState(liesWahl);

  const [fragtNachCode, setFragtNachCode] = useState(false);
  const [eigenerFehler, setEigenerFehler] = useState<string | null>(null);
  const [abmeldegrund] = useState(holeAbmeldegrund);

  const [signIn, { loading, error }] = useMutation<{ signIn: StoredSession }>(
    SIGN_IN,
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setEigenerFehler(null);

    let result: Awaited<ReturnType<typeof signIn>> | null = null;

    try {
      result = await signIn({
        variables: {
          input: {
            email,
            password,
            angemeldetBleiben,
            ...(code.trim() === '' ? {} : { totpCode: code.trim() }),
          },
        },
      });
    } catch (problem) {
      if (brauchtZweitenFaktor(problem)) {
        setFragtNachCode(true);

        return;
      }

      setEigenerFehler(
        problem instanceof Error
          ? problem.message
          : 'Anmeldung fehlgeschlagen.',
      );

      return;
    }

    if (result?.data?.signIn !== undefined) {
      merkeWahl(angemeldetBleiben);
      startSession(result.data.signIn);
    }
  };

  const meldung =
    eigenerFehler ??
    (fragtNachCode ? null : (error?.message ?? null)) ??
    (ssoMeldung?.art === 'fehler' ? ssoMeldung.text : null);

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">Willkommen zurück</div>
        <p className="auth__subtitle">Melden Sie sich bei Ihrem Konto an.</p>

        {meldung !== null && (
          <div className="error-banner">
            {meldung}
            <AbhilfeLink meldung={meldung} />
          </div>
        )}

        {abmeldegrund === 'leerlauf' && meldung === null && (
          <div className="auth__hinweis" role="status">
            Sie wurden nach längerer Inaktivität abgemeldet, wie es Ihr
            Arbeitsbereich vorsieht.
          </div>
        )}

        {fragtNachCode && meldung === null && (
          <div className="auth__hinweis" role="status">
            Für dieses Konto ist die Zwei-Faktor-Anmeldung eingeschaltet.
          </div>
        )}

        {!fragtNachCode && (
          <SsoKnoepfe zweck="anmelden" angemeldetBleiben={angemeldetBleiben} />
        )}

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field field--mit-aside">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Link className="field__aside" to="/passwort-vergessen">
              Vergessen?
            </Link>
          </div>

          <div className="auth__bleiben">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={angemeldetBleiben}
                aria-describedby="angemeldet-bleiben-hinweis"
                onChange={(ereignis) =>
                  setAngemeldetBleiben(ereignis.target.checked)
                }
              />
              Angemeldet bleiben
            </label>
            <p id="angemeldet-bleiben-hinweis" className="field__hint">
              {angemeldetBleiben
                ? 'Bis zu 30 Tage, auch nach dem Schließen des Browsers. Nur auf eigenen Geräten.'
                : 'Sie werden abgemeldet, sobald Sie den Browser schließen.'}
            </p>
          </div>

          {fragtNachCode && (
            <div className="field">
              <label htmlFor="totp">Code aus Ihrer App</label>
              <input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="123456"
                value={code}
                onChange={(ereignis) => setCode(ereignis.target.value)}
              />
              <p className="field__hint">
                Kein Telefon zur Hand? Einer Ihrer Wiederherstellungscodes geht
                hier auch.
              </p>
            </div>
          )}

          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <p className="auth__switch">
          Noch kein Konto? <Link to="/registrieren">Registrieren</Link>
        </p>
        <p className="auth__switch">
          <Link to="/impressum">Impressum</Link> ·{' '}
          <Link to="/datenschutz">Datenschutz</Link>
        </p>
      </div>
    </div>
  );
};
