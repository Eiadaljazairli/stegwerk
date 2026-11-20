import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { IconInvoices } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { ReminderPreviewDialog } from '../components/ReminderPreviewDialog';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';
import {
  INVOICES,
  OPEN_ITEMS,
  REMINDER_PREVIEW,
  SEND_INVOICE_REMINDER,
} from '../lib/queries';
import {
  DUNNING_LABELS,
  formatDate,
  formatMoney,
  NEXT_STEP_LABELS,
  type OpenItem,
  type ReminderPreview,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';

export const OpenItemsPage = () => {
  const client = useApolloClient();
  const { data, loading, error, refetch } = useQuery<{ openItems: OpenItem[] }>(
    OPEN_ITEMS,
  );
  const [sendReminder, { loading: sending }] = useMutation(
    SEND_INVOICE_REMINDER,
    { refetchQueries: [OPEN_ITEMS, INVOICES] },
  );

  const [entwurf, setEntwurf] = useState<
    (ReminderPreview & { invoiceId: string }) | null
  >(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const items = data?.openItems ?? [];
  const summe = items.reduce(
    (sum, item) => sum + item.invoice.totals.grossCents,
    0,
  );

  const ansehen = async (item: OpenItem): Promise<void> => {
    setFehler(null);

    try {
      const antwort = await client.query<{ reminderPreview: ReminderPreview }>({
        query: REMINDER_PREVIEW,
        variables: { invoiceId: item.invoice.id },
        fetchPolicy: 'network-only',
      });

      setEntwurf({
        ...antwort.data.reminderPreview,
        invoiceId: item.invoice.id,
      });
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  const verschicken = async (): Promise<void> => {
    if (entwurf === null) {
      return;
    }

    setFehler(null);

    try {
      await sendReminder({ variables: { invoiceId: entwurf.invoiceId } });
      setEntwurf(null);
      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  return (
    <>
      {entwurf !== null && (
        <ReminderPreviewDialog
          preview={entwurf}
          sending={sending}
          onCancel={() => setEntwurf(null)}
          onConfirm={() => void verschicken()}
        />
      )}

      <ObjectHeader
        hilfe="offene-posten"
        kind="invoice"
        icon={IconInvoices}
        label="Offene Posten"
        title={
          items.length === 0
            ? 'Nichts offen'
            : `${String(items.length)} überfällig · ${formatMoney(summe)}`
        }
        actions={
          <Link className="button button--ghost" to="/rechnungen">
            Alle Rechnungen
          </Link>
        }
      />

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {loading && data === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={6} />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nichts überfällig"
          description="Alle gestellten Rechnungen sind entweder noch innerhalb der Frist oder bezahlt."
        />
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Rechnung</th>
                <th>Firma</th>
                <th>Fällig war</th>
                <th className="numeric">Tage</th>
                <th className="numeric">Betrag</th>
                <th className="numeric">Zinsen + Pauschale</th>
                <th>Stand</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.invoice.id}>
                  <td data-label="Rechnung">
                    <Link to={`/rechnungen/${item.invoice.id}`}>
                      {item.invoice.number ?? '—'}
                    </Link>
                  </td>
                  <td data-label="Firma">
                    {item.invoice.company?.name ?? '—'}
                  </td>
                  <td data-label="Fällig war">
                    {item.invoice.dueOn === null
                      ? '—'
                      : formatDate(item.invoice.dueOn)}
                  </td>
                  <td data-label="Tage" className="numeric">
                    <span className={item.inDefault ? 'is-overdue' : ''}>
                      {item.daysOverdue}
                    </span>
                  </td>
                  <td data-label="Betrag" className="numeric">
                    {formatMoney(item.invoice.totals.grossCents)}
                  </td>
                  <td data-label="Zinsen + Pauschale" className="numeric">
                    {item.interestCents + item.lateFeeCents === 0
                      ? '—'
                      : formatMoney(item.interestCents + item.lateFeeCents)}
                  </td>
                  <td data-label="Stand">{DUNNING_LABELS[item.level]}</td>
                  <td>
                    {item.nextStep === null ? (
                      <span className="field__hint">Abgeschlossen</span>
                    ) : item.nextStepOn !== null ? (
                      <span className="field__hint">
                        ab {formatDate(item.nextStepOn)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="button button--ghost row-action"
                        onClick={() => void ansehen(item)}
                      >
                        {NEXT_STEP_LABELS[item.nextStep] ?? 'Mahnen'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <p className="field__hint">
        Zinsen erscheinen erst, wenn unter Team der Basiszinssatz nach §247 BGB
        hinterlegt ist. Er ändert sich zum 1. Januar und zum 1. Juli und wird
        von der Bundesbank veröffentlicht. Die Pauschale von 40 € nach §288 Abs.
        5 BGB gilt nur gegenüber Unternehmen und erst ab Verzug.
      </p>
    </>
  );
};
