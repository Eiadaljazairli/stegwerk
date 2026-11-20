import { useMutation } from '@apollo/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { fehlergrund } from '../lib/fehlergrund';
import {
  ACCEPT_INVITATION,
  RESEND_EMAIL_VERIFICATION,
  SWITCH_WORKSPACE,
} from '../lib/queries';
import { type StoredSession } from '../lib/session';
import { Wordmark } from '../components/Wordmark';
import { AbhilfeLink } from '../components/AbhilfeLink';

type Phase = 'working' | 'done' | 'failed' | 'otherAddress' | 'notVerified';

const TITEL: Record<Phase, string> = {
  working: 'Einladung',
  done: 'Einladung',
  failed: 'Einladung ungültig',
  otherAddress: 'Einladung für eine andere Adresse',
  notVerified: 'Noch eine Bestätigung',
};

const PHASE_JE_GRUND: Record<string, Phase> = {
  INVITATION_FOR_OTHER_ADDRESS: 'otherAddress',
  EMAIL_NOT_VERIFIED: 'notVerified',
};

export const AcceptInvitationPage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { session, startSession, endSession } = useAuth();

  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('Einladung wird geprüft…');

  const [acceptInvitation] = useMutation(ACCEPT_INVITATION);
  const [switchWorkspace] = useMutation<{ switchWorkspace: StoredSession }>(
    SWITCH_WORKSPACE,
  );
  const [resend] = useMutation(RESEND_EMAIL_VERIFICATION);
  const [erneutGeschickt, setErneutGeschickt] = useState(false);

  const annehmen = useCallback(async () => {
    setPhase('working');
    setMessage('Einladung wird geprüft…');

    const accepted = await acceptInvitation({
      variables: { input: { token } },
    }).catch((error: Error) => {
      setPhase(PHASE_JE_GRUND[fehlergrund(error) ?? ''] ?? 'failed');
      setMessage(error.message);

      return null;
    });

    const workspaceId = accepted?.data?.acceptInvitation?.workspaceId;

    if (typeof workspaceId !== 'string') {
      return;
    }

    const switched = await switchWorkspace({
      variables: { workspaceId },
    }).catch(() => null);

    if (switched?.data?.switchWorkspace !== undefined) {
      startSession(switched.data.switchWorkspace);
      setPhase('done');
      setMessage(
        `Willkommen bei ${switched.data.switchWorkspace.workspace.name}.`,
      );
      window.setTimeout(() => navigate('/'), 1200);
    }
  }, [acceptInvitation, switchWorkspace, startSession, navigate, token]);

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }

    hasRun.current = true;

    void annehmen();
  }, [annehmen]);

  const bestaetigungErneutSchicken = async () => {
    const ergebnis = await resend().catch((fehler: Error) => {
      setMessage(fehler.message);

      return null;
    });

    if (ergebnis?.data?.resendEmailVerification === true) {
      setErneutGeschickt(true);
    }
  };

  return (
    <div className="auth auth--eingebettet">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">{TITEL[phase]}</div>

        {phase === 'otherAddress' ? (
          <>
            <div className="error-banner">
              {message}
              <AbhilfeLink meldung={message} />
            </div>
            <div className="auth__actions">
              <button className="button" type="button" onClick={endSession}>
                Abmelden
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => navigate('/')}
              >
                Zur Übersicht
              </button>
            </div>
            {session !== null && (
              <p className="auth__hint">
                Angemeldet als {session.user.email}. Nach dem Abmelden führt die
                Anmeldung zurück zu dieser Einladung.
              </p>
            )}
          </>
        ) : phase === 'notVerified' ? (
          <>
            <div className="error-banner">
              {message}
              <AbhilfeLink meldung={message} />
            </div>
            {erneutGeschickt && (
              <p className="auth__subtitle">
                Wir haben eine neue Bestätigungsmail geschickt.
              </p>
            )}
            <div className="auth__actions">
              <button
                className="button"
                type="button"
                onClick={() => void annehmen()}
              >
                Erneut versuchen
              </button>
              {!erneutGeschickt && (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void bestaetigungErneutSchicken()}
                >
                  Bestätigungsmail erneut schicken
                </button>
              )}
            </div>
            {session !== null && (
              <p className="auth__hint">
                Die Mail ging an {session.user.email}. Die Einladung bleibt
                offen, bis Sie die Adresse bestätigt haben.
              </p>
            )}
          </>
        ) : phase === 'failed' ? (
          <>
            <div className="error-banner">
              {message}
              <AbhilfeLink meldung={message} />
            </div>
            <button
              className="button"
              type="button"
              onClick={() => navigate('/')}
            >
              Zur Übersicht
            </button>
          </>
        ) : (
          <p className="auth__subtitle">{message}</p>
        )}
      </div>
    </div>
  );
};
