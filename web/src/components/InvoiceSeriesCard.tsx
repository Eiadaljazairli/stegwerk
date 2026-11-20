import { useMutation } from '@apollo/client';
import { useState } from 'react';

import {
  CREATE_INVOICE_SERIES,
  END_INVOICE_SERIES,
  INVOICE,
  INVOICE_SERIES_LIST,
} from '../lib/queries';
import {
  formatDate,
  INTERVAL_LABELS,
  type Invoice,
  type InvoiceSeriesInterval,
} from '../lib/types';

const morgen = (): string => {
  const tag = new Date();

  tag.setDate(tag.getDate() + 1);

  return `${String(tag.getFullYear())}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`;
};

export const InvoiceSeriesCard = ({ invoice }: { invoice: Invoice }) => {
  const [takt, setTakt] = useState<InvoiceSeriesInterval>('monthly');
  const [startOn, setStartOn] = useState(morgen);
  const [endOn, setEndOn] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const refetchQueries = [
    { query: INVOICE, variables: { id: invoice.id } },
    { query: INVOICE_SERIES_LIST },
  ];
  const [anlegen, { loading }] = useMutation(CREATE_INVOICE_SERIES, {
    refetchQueries,
  });
  const [beenden] = useMutation(END_INVOICE_SERIES, { refetchQueries });

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const serie = invoice.templateSeries ?? null;

  return (
    <section className="card invoice-series">
      <h2>Wiederkehrend</h2>

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {serie !== null ? (
        <>
          <p className="invoice-series__state">
            {INTERVAL_LABELS[serie.interval]}, nächster Entwurf am{' '}
            <strong>{formatDate(serie.nextRunOn)}</strong>
            {serie.endOn !== null && `, bis ${formatDate(serie.endOn)}`}.
          </p>
          <button
            type="button"
            className="button button--danger"
            onClick={() =>
              void beenden({ variables: { id: serie.id } }).catch(fang)
            }
          >
            Serie beenden
          </button>
        </>
      ) : (
        <>
          <p className="field__hint">
            Legt diese Rechnung im gewählten Takt als neuen Entwurf an, mit
            denselben Positionen und Texten. Sie bekommen eine Mail und stellen
            ihn mit einem Klick.
          </p>
          <div className="invoice-series__form">
            <div className="field">
              <label htmlFor="serie-takt">Takt</label>
              <select
                id="serie-takt"
                value={takt}
                onChange={(event) =>
                  setTakt(event.target.value as InvoiceSeriesInterval)
                }
              >
                {(Object.keys(INTERVAL_LABELS) as InvoiceSeriesInterval[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {INTERVAL_LABELS[key]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="field">
              <label htmlFor="serie-start">Erster Entwurf am</label>
              <input
                id="serie-start"
                type="date"
                value={startOn}
                onChange={(event) => setStartOn(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="serie-ende">Bis (optional)</label>
              <input
                id="serie-ende"
                type="date"
                value={endOn}
                onChange={(event) => setEndOn(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="button button--ghost"
              disabled={loading || invoice.lines.length === 0}
              onClick={() => {
                setFehler(null);
                void anlegen({
                  variables: {
                    input: {
                      invoiceId: invoice.id,
                      interval: takt,
                      startOn,
                      ...(endOn === '' ? {} : { endOn }),
                    },
                  },
                }).catch(fang);
              }}
            >
              Serie anlegen
            </button>
          </div>
        </>
      )}
    </section>
  );
};
