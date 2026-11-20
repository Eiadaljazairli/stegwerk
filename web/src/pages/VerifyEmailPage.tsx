import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { istGrund } from '../lib/fehlergrund';
import { ME, RESEND_EMAIL_VERIFICATION, VERIFY_EMAIL } from '../lib/queries';
import { forgetPendingVerification } from '../lib/session';
import { Wordmark } from '../components/Wordmark';

const FUER_ANDERES_KONTO = 'EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT';

type Phase = 'bereit' | 'laeuft' | 'fertig' | 'anderesKonto' | 'fehler';

const TITEL: Record<Phase, string> = {
  bereit: 'E-Mail-Adresse bestätigen',
  laeuft: 'E-Mail-Adresse bestätigen',
  fertig: 'Adresse bestätigt',
  anderesKonto: 'Link für ein anderes Konto',
  fehler: 'Link nicht mehr gültig',
};

export const VerifyEmailPage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { session, endSession } = useAuth();

  const [phase, setPhase] = useState<Phase | null>(null);
  const [meldung, setMeldung] = useState('');
  const [erneutGeschickt, setErneutGeschickt] = useState(false);

  const [verifyEmail] = useMutation(VERIFY_EMAIL, {
    refetchQueries: [{ query: ME }],
  });
  const [resend] = useMutation(RESEND_EMAIL_VERIFICATION);

  const { data } = useQuery<{ me: { emailVerifiedAt: string | null } }>(ME, {
    fetchPolicy: 'network-only',
  });

  const abgeleitet: Phase | null =
    data === undefined
      ? null
      : data.me.emailVerifiedAt === null
        ? 'bereit'
        : 'fertig';
  const sichtbar = phase ?? abgeleitet;

  const bestaetigen = async () => {
    setPhase('laeuft');

    const ergebnis = await verifyEmail({ variables: { token } }).catch(
      (fehler: Error) => {
        setPhase(
          istGrund(fehler, FUER_ANDERES_KONTO) ? 'anderesKonto' : 'fehler',
        );
        setMeldung(fehler.message);

        return null;
      },
    );

    if (ergebnis?.data?.verifyEmail !== true) {
      return;
    }

    forgetPendingVerification();
    setPhase('fertig');
  };

  const erneutSchicken = async () => {
    const ergebnis = await resend().catch((fehler: Error) => {
      setMeldung(fehler.message);

      return null;
    });

    if (ergebnis?.data?.resendEmailVerification === true) {
      setErneutGeschickt(true);
    }
  };

  const weiter = () => {
    forgetPendingVerification();
    navigate('/');
  };

  const inhalt = () => {
    if (sichtbar === 'fertig') {
      return (
        <>
          <p className="auth__subtitle">
            {session?.user.email} gehört bestätigt zu Ihrem Konto. Sie können
            Einladungen zu Arbeitsbereichen annehmen.
          </p>
          <button className="button" type="button" onClick={weiter}>
            Weiter
          </button>
        </>
      );
    }

    if (sichtbar === 'anderesKonto') {
      return (
        <>
          <div className="error-banner">{meldung}</div>
          <div className="auth__actions">
            <button className="button" type="button" onClick={endSession}>
              Abmelden
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={weiter}
            >
              Zur Übersicht
            </button>
          </div>
          {session !== null && (
            <p className="auth__hint">
              Angemeldet als {session.user.email}. Nach dem Abmelden führt die
              Anmeldung zurück zu diesem Link.
            </p>
          )}
        </>
      );
    }

    if (sichtbar === 'fehler') {
      return (
        <>
          <div className="error-banner">{meldung}</div>
          {erneutGeschickt ? (
            <p className="auth__subtitle">
              Wir haben eine neue Mail an {session?.user.email} geschickt.
            </p>
          ) : (
            <div className="auth__actions">
              <button
                className="button"
                type="button"
                onClick={() => void erneutSchicken()}
              >
                Neue Mail anfordern
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={weiter}
              >
                Zur Übersicht
              </button>
            </div>
          )}
        </>
      );
    }

    if (sichtbar === null) {
      return <p className="auth__subtitle">Einen Moment …</p>;
    }

    return (
      <>
        <p className="auth__subtitle">
          Bestätigen Sie, dass {session?.user.email} Ihnen gehört. Erst danach
          können Sie Einladungen zu Arbeitsbereichen annehmen.
        </p>
        <button
          className="button"
          type="button"
          disabled={sichtbar === 'laeuft' || token === ''}
          onClick={() => void bestaetigen()}
        >
          {sichtbar === 'laeuft' ? 'Wird bestätigt …' : 'Adresse bestätigen'}
        </button>
      </>
    );
  };

  return (
    <div className="auth auth--eingebettet">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={20} />
        </div>

        <div className="auth__title">
          {sichtbar === null ? TITEL.bereit : TITEL[sichtbar]}
        </div>

        {inhalt()}
      </div>
    </div>
  );
};
