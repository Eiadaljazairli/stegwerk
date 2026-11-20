import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import {
  BILLING_PLANS,
  CREATE_BILLING_PORTAL_SESSION,
  CREATE_CHECKOUT_SESSION,
  ENTITLEMENT,
} from '../lib/queries';
import {
  type BillingPlanView,
  type Entitlement,
  formatCents,
  formatDate,
  SUBSCRIPTION_STATUS_LABELS,
} from '../lib/types';

type Interval = 'MONTH' | 'YEAR';

export const BillingPage = () => {
  const [interval, setInterval] = useState<Interval>('MONTH');
  const [seats, setSeats] = useState(3);

  const { data: entitlementData, loading } = useQuery<{
    entitlement: Entitlement;
  }>(ENTITLEMENT);
  const { data: planData } = useQuery<{ billingPlans: BillingPlanView[] }>(
    BILLING_PLANS,
    { skip: entitlementData?.entitlement.billingConfigured !== true },
  );

  const [createCheckoutSession, { loading: startingCheckout, error }] =
    useMutation<{ createCheckoutSession: string }>(CREATE_CHECKOUT_SESSION);
  const [createPortalSession, { error: portalError }] = useMutation<{
    createBillingPortalSession: string;
  }>(CREATE_BILLING_PORTAL_SESSION);

  const entitlement = entitlementData?.entitlement;
  const plans = (planData?.billingPlans ?? []).filter((p) => p.purchasable);

  const goToCheckout = async (plan: string) => {
    const result = await createCheckoutSession({
      variables: { plan, interval, seats },
    }).catch(() => null);

    const url = result?.data?.createCheckoutSession;

    if (typeof url === 'string') {
      window.location.assign(url);
    }
  };

  const goToPortal = async () => {
    const result = await createPortalSession().catch(() => null);
    const url = result?.data?.createBillingPortalSession;

    if (typeof url === 'string') {
      window.location.assign(url);
    }
  };

  if (loading) {
    return <div className="state">Wird geladen…</div>;
  }

  const priceFor = (plan: BillingPlanView) =>
    interval === 'MONTH' ? plan.monthlyPricePerSeat : plan.yearlyPricePerSeat;

  if (entitlement?.billingConfigured === false) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Abrechnung</h1>
          <p className="page__subtitle">Plan, Sitzplätze und Zahlungsdaten.</p>
        </div>
      </div>

      {(error ?? portalError) !== undefined && (
        <div className="error-banner">{(error ?? portalError)?.message}</div>
      )}

      <div className="metrics">
        <div className="card metric">
          <div className="metric__label">Status</div>
          <div className="metric__value" style={{ fontSize: 20 }}>
            {entitlement === undefined
              ? '—'
              : SUBSCRIPTION_STATUS_LABELS[entitlement.status]}
          </div>
        </div>
        <div
          className={
            (entitlement?.trialDaysLeft ?? 99) <= 3
              ? 'card metric is-alarming'
              : 'card metric'
          }
        >
          <div className="metric__label">Testphase</div>
          <div className="metric__value">
            {entitlement?.trialDaysLeft === null ||
            entitlement?.trialDaysLeft === undefined
              ? '—'
              : `${entitlement.trialDaysLeft} Tage`}
          </div>
        </div>
        <div
          className={
            entitlement !== undefined &&
            entitlement.usedSeats >= entitlement.seats
              ? 'card metric is-alarming'
              : 'card metric'
          }
        >
          <div className="metric__label">Sitzplätze</div>
          <div className="metric__value">
            {entitlement?.usedSeats ?? 0} / {entitlement?.seats ?? 0}
          </div>
        </div>
        <div className="card metric">
          <div className="metric__label">Nächste Abrechnung</div>
          <div className="metric__value" style={{ fontSize: 20 }}>
            {formatDate(entitlement?.currentPeriodEnd ?? null)}
          </div>
        </div>
      </div>

      {entitlement?.cancelAtPeriodEnd === true && (
        <div className="error-banner">
          Ihr Abonnement endet am {formatDate(entitlement.currentPeriodEnd)}.
          Bis dahin bleibt alles nutzbar.
        </div>
      )}

      <div className="section-heading">
        <h2>Pläne</h2>
        <div
          className="segmented"
          role="group"
          aria-label="Abrechnungszeitraum"
        >
          <button
            type="button"
            className={
              interval === 'MONTH'
                ? 'segmented__item is-active'
                : 'segmented__item'
            }
            onClick={() => setInterval('MONTH')}
          >
            Monatlich
          </button>
          <button
            type="button"
            className={
              interval === 'YEAR'
                ? 'segmented__item is-active'
                : 'segmented__item'
            }
            onClick={() => setInterval('YEAR')}
          >
            Jährlich
          </button>
        </div>
      </div>

      <div className="form-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="billing-seats">Sitzplätze</label>
          <input
            id="billing-seats"
            type="number"
            min={entitlement?.usedSeats ?? 1}
            max={200}
            value={seats}
            onChange={(event) =>
              setSeats(Math.max(1, Number(event.target.value) || 1))
            }
          />
        </div>
        <span className="pagination__summary">
          Mindestens {entitlement?.usedSeats ?? 1} — so viele sind belegt.
        </span>
      </div>

      <div className="plans">
        {plans.map((plan) => {
          const isCurrent = entitlement?.plan === plan.plan;

          return (
            <div
              className={isCurrent ? 'card plan is-current' : 'card plan'}
              key={plan.plan}
            >
              <div className="plan__name">{plan.name}</div>
              <div className="plan__price">
                {formatCents(priceFor(plan))}
                <span className="plan__unit">
                  {interval === 'MONTH'
                    ? ' / Platz / Monat'
                    : ' / Platz / Jahr'}
                </span>
              </div>
              <div className="plan__seats">
                {plan.maxSeats === null
                  ? 'Unbegrenzte Sitzplätze'
                  : `Bis zu ${plan.maxSeats} Sitzplätze`}
              </div>
              <div className="plan__total">
                {formatCents(priceFor(plan) * seats)} für {seats}{' '}
                {seats === 1 ? 'Platz' : 'Plätze'}
              </div>
              <button
                className="button"
                type="button"
                disabled={
                  startingCheckout ||
                  entitlement?.billingConfigured === false ||
                  (plan.maxSeats !== null && seats > plan.maxSeats)
                }
                onClick={() => void goToCheckout(plan.plan)}
              >
                {isCurrent ? 'Plan ändern' : `${plan.name} wählen`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="pagination__summary" style={{ marginTop: 12 }}>
        Alle Preise verstehen sich netto, zuzüglich der gesetzlichen
        Umsatzsteuer. Abgerechnet wird je belegtem Platz.
      </p>

      {entitlement?.status !== 'TRIALING' && (
        <div className="import-step__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => void goToPortal()}
          >
            Zahlungsdaten und Rechnungen verwalten
          </button>
        </div>
      )}
    </>
  );
};
