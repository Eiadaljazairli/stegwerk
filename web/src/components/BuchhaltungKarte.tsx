import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { anbieterName, standText } from '../lib/buchhaltung';
import {
  BUCHHALTUNG_VERBINDUNG,
  INVOICE,
  RECHNUNG_AN_BUCHHALTUNG,
} from '../lib/queries';
import { type BuchhaltungVerbindung, type Invoice } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';

export const BuchhaltungKarte = ({ invoice }: { invoice: Invoice }) => {
  const { can } = usePermissions();
  const { data } = useQuery<{
    buchhaltungVerbindung: BuchhaltungVerbindung | null;
  }>(BUCHHALTUNG_VERBINDUNG);
  const [fehler, setFehler] = useState<string | null>(null);
  const [senden, { loading }] = useMutation(RECHNUNG_AN_BUCHHALTUNG, {
    refetchQueries: [{ query: INVOICE, variables: { id: invoice.id } }],
  });
  const client = useApolloClient();

  const unterwegs =
    invoice.buchhaltung?.status === 'wartet' ||
    invoice.buchhaltung?.status === 'laeuft';

  useEffect(() => {
    if (!unterwegs) {
      return undefined;
    }

    const takt = window.setInterval(() => {
      void client
        .query({
          query: INVOICE,
          variables: { id: invoice.id },
          fetchPolicy: 'network-only',
        })
        .catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(takt);
  }, [unterwegs, client, invoice.id]);

  const verbindung = data?.buchhaltungVerbindung ?? null;

  if (
    invoice.number === null ||
    (verbindung === null && !invoice.buchhaltung)
  ) {
    return null;
  }

  const stand = standText(invoice.buchhaltung);
  const name = anbieterName(
    invoice.buchhaltung?.anbieter ?? verbindung?.anbieter ?? '',
  );
  const darfSenden = can('invoice:issue') && verbindung !== null;
  const knopf =
    stand === null
      ? `An ${anbieterName(verbindung?.anbieter ?? '')} senden`
      : stand.wiederholbar
        ? 'Erneut versuchen'
        : null;

  const los = async () => {
    setFehler(null);
    await senden({ variables: { invoiceId: invoice.id } }).catch(
      (problem: unknown) =>
        setFehler(problem instanceof Error ? problem.message : 'Fehler.'),
    );
  };

  return (
    <section
      className="card buchhaltung-karte"
      aria-labelledby="buchhaltung-titel"
    >
      <h2 id="buchhaltung-titel">Buchhaltung</h2>

      <p
        className={`buchhaltung-karte__stand buchhaltung-karte__stand--${stand?.ton ?? 'offen'}`}
        role="status"
        aria-live="polite"
      >
        {stand === null ? `Noch nicht an ${name} übertragen.` : stand.text}
      </p>

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {darfSenden && knopf !== null && (
        <div>
          <button
            type="button"
            className="button button--ghost"
            disabled={loading}
            onClick={() => void los()}
          >
            {loading ? 'Wird eingereiht …' : knopf}
          </button>
        </div>
      )}

      {verbindung?.fehlerZeigen === true && (
        <p className="field__hint">
          {name} lehnt den API-Schlüssel ab.{' '}
          <Link to="/buchhaltung">Zur Buchhaltung</Link>
        </p>
      )}
    </section>
  );
};
