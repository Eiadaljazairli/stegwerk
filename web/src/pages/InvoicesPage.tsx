import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { DatevExport } from '../components/DatevExport';
import { EmptyState } from '../components/EmptyState';
import { IconInvoices } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { RowMenu, type RowMenuItem } from '../components/RowMenu';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';
import { type StatusTab, StatusTabs } from '../components/StatusTabs';
import { downloadInvoicePdf } from '../lib/download';
import {
  DELETE_INVOICE,
  INVOICE_NUMBER_GAPS,
  INVOICE_SERIES_LIST,
  INVOICES,
  MARK_INVOICE_PAID,
} from '../lib/queries';
import {
  formatDate,
  formatMoney,
  type Invoice,
  type InvoiceSeries,
  INTERVAL_LABELS,
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';

const heute = (): string => new Date().toISOString().slice(0, 10);

const offeneForderung = (invoice: Invoice): boolean =>
  invoice.status === 'ISSUED' && invoice.correctsInvoiceId === null;

const ueberfaellig = (invoice: Invoice): boolean =>
  offeneForderung(invoice) && invoice.dueOn !== null && invoice.dueOn < heute();

const summe = (liste: Invoice[]): number =>
  liste.reduce((sum, invoice) => sum + invoice.totals.grossCents, 0);

const UEBERFAELLIG = 'ueberfaellig';

export const InvoicesPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusFilter = params.get('status') ?? '';
  const setStatusFilter = (key: string) =>
    setParams(key === '' ? {} : { status: key }, { replace: true });
  const [fehler, setFehler] = useState<string | null>(null);
  const [frageLoeschen, setFrageLoeschen] = useState<Invoice | null>(null);

  const { data, loading, error } = useQuery<{ invoices: Invoice[] }>(INVOICES);
  const { data: gapData } = useQuery<{ invoiceNumberGaps: string[] }>(
    INVOICE_NUMBER_GAPS,
  );

  const { data: serienData } = useQuery<{
    invoiceSeriesList: InvoiceSeries[];
  }>(INVOICE_SERIES_LIST);
  const serien = serienData?.invoiceSeriesList ?? [];
  const invoices = data?.invoices ?? [];
  const gaps = gapData?.invoiceNumberGaps ?? [];
  const [markPaid] = useMutation(MARK_INVOICE_PAID, {
    refetchQueries: [INVOICES],
  });
  const [deleteInvoice] = useMutation(DELETE_INVOICE, {
    refetchQueries: [INVOICES, INVOICE_NUMBER_GAPS],
  });

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const mitStatus = (status: Invoice['status']) =>
    invoices.filter((invoice) => invoice.status === status);
  const offene = invoices.filter(offeneForderung);
  const ueberfaellige = invoices.filter(ueberfaellig);

  const reiter: StatusTab[] = [
    {
      key: '',
      label: 'Alle',
      count: invoices.length,
      sumCents: summe(invoices),
    },
    {
      key: 'DRAFT',
      label: 'Entwürfe',
      count: mitStatus('DRAFT').length,
      sumCents: summe(mitStatus('DRAFT')),
    },
    {
      key: 'ISSUED',
      label: 'Offen',
      count: offene.length,
      sumCents: summe(offene),
    },
    {
      key: UEBERFAELLIG,
      label: 'Überfällig',
      count: ueberfaellige.length,
      sumCents: summe(ueberfaellige),
      warn: true,
    },
    {
      key: 'PAID',
      label: 'Bezahlt',
      count: mitStatus('PAID').length,
      sumCents: summe(mitStatus('PAID')),
    },
    {
      key: 'CANCELLED',
      label: 'Storniert',
      count: mitStatus('CANCELLED').length,
      sumCents: summe(mitStatus('CANCELLED')),
    },
  ];

  const shown =
    statusFilter === ''
      ? invoices
      : statusFilter === UEBERFAELLIG
        ? ueberfaellige
        : statusFilter === 'ISSUED'
          ? offene
          : invoices.filter((invoice) => invoice.status === statusFilter);

  const aktionen = (invoice: Invoice): RowMenuItem[] => [
    {
      label: 'Öffnen',
      onSelect: () => navigate(`/rechnungen/${invoice.id}`),
    },
    {
      label: 'PDF herunterladen',
      onSelect: () =>
        void downloadInvoicePdf(
          invoice.id,
          `Rechnung-${invoice.number ?? 'Entwurf'}.pdf`,
        ).catch(fang),
    },
    ...(invoice.status === 'ISSUED' && invoice.correctsInvoiceId === null
      ? [
          {
            label: 'Als bezahlt buchen',
            onSelect: () =>
              void markPaid({ variables: { id: invoice.id } }).catch(fang),
          },
        ]
      : []),
    ...(invoice.status === 'DRAFT'
      ? [
          {
            label: 'Entwurf löschen',
            danger: true,
            onSelect: () => setFrageLoeschen(invoice),
          },
        ]
      : []),
  ];

  return (
    <>
      {frageLoeschen !== null && (
        <ConfirmDialog
          title="Diesen Entwurf löschen?"
          consequence="Der Entwurf hat noch keine Nummer und wird endgültig entfernt."
          confirmLabel="Entwurf löschen"
          onCancel={() => setFrageLoeschen(null)}
          onConfirm={() => {
            void deleteInvoice({ variables: { id: frageLoeschen.id } }).catch(
              fang,
            );
            setFrageLoeschen(null);
          }}
        />
      )}

      <ObjectHeader
        hilfe="rechnungen"
        kind="invoice"
        icon={IconInvoices}
        label="Rechnungen"
        anzahl={invoices.length}
        actions={
          <>
            <DatevExport />
            <Link className="button button--ghost" to="/angebote">
              Angebote
            </Link>
          </>
        }
      />

      {gaps.length > 0 && (
        <div className="banner banner--warning">
          In der Nummernfolge fehlen: {gaps.join(', ')}. Eine Lücke ist nicht
          zwangsläufig ein Fehler, aber sie ist etwas, das Sie bei einer Prüfung
          erklären können müssen.
        </div>
      )}

      <StatusTabs
        tabs={reiter}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {loading && data === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={7} />
        </>
      ) : shown.length === 0 ? (
        <EmptyState
          title={
            statusFilter === '' ? 'Noch keine Rechnungen' : 'Keine Treffer'
          }
          description={
            statusFilter === ''
              ? 'Eine Rechnung entsteht aus einem angenommenen Angebot. Öffnen Sie das Angebot und drücken Sie dort auf Rechnung erstellen.'
              : 'In diesem Status liegt gerade nichts.'
          }
        />
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Firma</th>
                <th>Datum</th>
                <th>Fällig</th>
                <th className="numeric">Brutto</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Nummer">
                    <Link to={`/rechnungen/${invoice.id}`}>
                      {invoice.number ?? 'Entwurf'}
                    </Link>
                  </td>
                  <td data-label="Firma">{invoice.company?.name ?? '—'}</td>
                  <td data-label="Datum">{formatDate(invoice.issuedOn)}</td>
                  <td
                    data-label="Fällig"
                    className={ueberfaellig(invoice) ? 'is-overdue' : ''}
                  >
                    {invoice.dueOn === null ? '—' : formatDate(invoice.dueOn)}
                  </td>
                  <td data-label="Brutto" className="numeric">
                    {formatMoney(invoice.totals.grossCents)}
                  </td>
                  <td data-label="Status">
                    <span className={invoiceStatusBadgeClass(invoice.status)}>
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </span>
                  </td>
                  <td className="row-menu">
                    <RowMenu
                      label={`Aktionen für ${invoice.number ?? 'Entwurf'}`}
                      items={aktionen(invoice)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {serien.length > 0 && (
        <section className="invoice-series-list">
          <h2>Wiederkehrende Rechnungen</h2>
          <TableWrap>
            <table className="list-table">
              <thead>
                <tr>
                  <th>Vorlage</th>
                  <th>Firma</th>
                  <th>Takt</th>
                  <th>Nächster Entwurf</th>
                  <th>Bis</th>
                  <th className="numeric">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {serien.map((serie) => (
                  <tr key={serie.id}>
                    <td data-label="Vorlage">
                      <Link to={`/rechnungen/${serie.sourceInvoiceId}`}>
                        {serie.sourceInvoice?.number ?? 'Entwurf'}
                      </Link>
                    </td>
                    <td data-label="Firma">
                      {serie.sourceInvoice?.company?.name ?? '—'}
                    </td>
                    <td data-label="Takt">{INTERVAL_LABELS[serie.interval]}</td>
                    <td data-label="Nächster Entwurf">
                      {formatDate(serie.nextRunOn)}
                    </td>
                    <td data-label="Bis">
                      {serie.endOn === null ? '—' : formatDate(serie.endOn)}
                    </td>
                    <td data-label="Brutto" className="numeric">
                      {formatMoney(serie.sourceInvoice?.totals.grossCents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </section>
      )}
    </>
  );
};
