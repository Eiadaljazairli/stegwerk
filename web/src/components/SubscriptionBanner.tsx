import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { ENTITLEMENT } from '../lib/queries';
import { type Entitlement } from '../lib/types';

const TRIAL_WARNING_DAYS = 3;

export const SubscriptionBanner = () => {
  const { data } = useQuery<{ entitlement: Entitlement }>(ENTITLEMENT);
  const entitlement = data?.entitlement;

  if (entitlement === undefined || !entitlement.billingConfigured) {
    return null;
  }

  if (entitlement.readOnly) {
    return (
      <div className="banner banner--blocking">
        <span>
          {entitlement.status === 'TRIALING'
            ? 'Ihre Testphase ist abgelaufen. Ihre Daten bleiben lesbar, Änderungen sind gesperrt.'
            : 'Ihr Abonnement ist nicht aktiv. Ihre Daten bleiben lesbar, Änderungen sind gesperrt.'}
        </span>
        <Link to="/abrechnung">Plan wählen</Link>
      </div>
    );
  }

  if (
    entitlement.status === 'TRIALING' &&
    entitlement.trialDaysLeft !== null &&
    entitlement.trialDaysLeft <= TRIAL_WARNING_DAYS
  ) {
    return (
      <div className="banner banner--warning">
        <span>
          Ihre Testphase endet in {entitlement.trialDaysLeft}{' '}
          {entitlement.trialDaysLeft === 1 ? 'Tag' : 'Tagen'}.
        </span>
        <Link to="/abrechnung">Jetzt Plan wählen</Link>
      </div>
    );
  }

  if (entitlement.status === 'PAST_DUE') {
    return (
      <div className="banner banner--warning">
        <span>Die letzte Zahlung ist fehlgeschlagen.</span>
        <Link to="/abrechnung">Zahlungsdaten prüfen</Link>
      </div>
    );
  }

  return null;
};
