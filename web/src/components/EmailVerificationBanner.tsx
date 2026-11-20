import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { ME, RESEND_EMAIL_VERIFICATION } from '../lib/queries';

export const EmailVerificationBanner = () => {
  const [geschickt, setGeschickt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const { data } = useQuery<{
    me: { email: string; emailVerifiedAt: string | null };
  }>(ME);
  const [resend, { loading }] = useMutation(RESEND_EMAIL_VERIFICATION);

  if (data === undefined || data.me.emailVerifiedAt !== null) {
    return null;
  }

  const erneutSchicken = async () => {
    setFehler(null);

    const ergebnis = await resend().catch((ausnahme: Error) => {
      setFehler(ausnahme.message);

      return null;
    });

    if (ergebnis?.data?.resendEmailVerification === true) {
      setGeschickt(true);
    }
  };

  return (
    <div className="banner banner--warning">
      <span>
        {geschickt
          ? `Wir haben eine neue Bestätigungsmail an ${data.me.email} geschickt.`
          : (fehler ??
            `Bitte bestätigen Sie ${data.me.email}. Bis dahin können Sie keine Einladungen zu anderen Arbeitsbereichen annehmen.`)}
      </span>
      {!geschickt && (
        <button
          className="banner__action"
          type="button"
          disabled={loading}
          onClick={() => void erneutSchicken()}
        >
          {loading ? 'Wird geschickt …' : 'Mail erneut schicken'}
        </button>
      )}
    </div>
  );
};
