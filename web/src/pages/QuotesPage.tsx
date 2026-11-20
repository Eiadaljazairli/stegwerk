import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { EmptyState } from '../components/EmptyState';
import { IconQuotes } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { RowMenu, type RowMenuItem } from '../components/RowMenu';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';
import { type StatusTab, StatusTabs } from '../components/StatusTabs';
import { downloadQuotePdf } from '../lib/download';
import {
  COMPANY_OPTIONS,
  CREATE_QUOTE,
  DECIDE_QUOTE,
  DELETE_QUOTE,
  DUPLICATE_QUOTE,
  MARK_QUOTE_SENT,
  QUOTES,
} from '../lib/queries';
import {
  ANGEBOTS_STATUS_FELD,
  type AngebotsSchritt,
  angebotsSchritt,
  angebotsSchrittFrage,
  angebotsSchrittVerboten,
} from '../lib/angebotsBoard';
import { usePermissions } from '../lib/usePermissions';
import { DarstellungSchalter, useDarstellung } from '../components/Darstellung';
import { RecordBoard } from '../components/RecordBoard';
import {
  type Company,
  formatDate,
  formatMoney,
  type QuoteStatus,
  QUOTE_STATUS_LABELS,
  type QuoteSummary,
  quoteStatusBadgeClass,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';
import { useBezeichnung } from '../lib/useBezeichnung';

const EMPTY_FORM = { companyId: '', validUntil: '' };

export const QuotesPage = () => {
  const bez = useBezeichnung();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [params, setParams] = useSearchParams();
  const statusFilter = params.get('status') ?? '';
  const setStatusFilter = (key: string) =>
    setParams(key === '' ? {} : { status: key }, { replace: true });
  const [fehler, setFehler] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuoteSummary | null>(null);
  const create = useCreate();
  const [darstellung, setzeDarstellung] = useDarstellung('quotes');
  const alsBoard = darstellung.art === 'board';
  const rechte = usePermissions();
  const schrittRechte = {
    senden: rechte.can('quote:send'),
    aendern: rechte.can('quote:write'),
  };
  const [schritt, setSchritt] = useState<{
    quote: QuoteSummary;
    art: AngebotsSchritt;
    fertig: (ergebnis: Promise<unknown> | false) => void;
  } | null>(null);
  const frage =
    schritt === null
      ? null
      : angebotsSchrittFrage(schritt.art, schritt.quote.number);

  const { data, loading, error } = useQuery<{ quotes: QuoteSummary[] }>(QUOTES);
  const [markQuoteSent] = useMutation(MARK_QUOTE_SENT, {
    refetchQueries: [QUOTES],
  });
  const [decideQuote] = useMutation(DECIDE_QUOTE, {
    refetchQueries: [QUOTES],
  });
  const { data: companyData } = useQuery<{
    companies: { items: Pick<Company, 'id' | 'name'>[] };
  }>(COMPANY_OPTIONS);

  const [createQuote, { loading: creating, error: createError }] = useMutation(
    CREATE_QUOTE,
    { refetchQueries: [QUOTES] },
  );
  const [deleteQuote] = useMutation(DELETE_QUOTE, {
    refetchQueries: [QUOTES],
  });
  const [duplicateQuote] = useMutation<{ duplicateQuote: { id: string } }>(
    DUPLICATE_QUOTE,
    { refetchQueries: [QUOTES] },
  );

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const companies = companyData?.companies.items ?? [];
  const quotes = data?.quotes ?? [];
  const shown =
    statusFilter === ''
      ? quotes
      : quotes.filter((quote) => quote.status === statusFilter);

  const mitStatus = (status: QuoteStatus) =>
    quotes.filter((quote) => quote.status === status);
  const summe = (liste: QuoteSummary[]) =>
    liste.reduce((sum, quote) => sum + quote.totals.grossCents, 0);

  const reiter: StatusTab[] = [
    { key: '', label: 'Alle', count: quotes.length, sumCents: summe(quotes) },
    {
      key: 'DRAFT',
      label: 'Entwürfe',
      count: mitStatus('DRAFT').length,
      sumCents: summe(mitStatus('DRAFT')),
    },
    {
      key: 'SENT',
      label: 'Beim Kunden',
      count: mitStatus('SENT').length,
      sumCents: summe(mitStatus('SENT')),
    },
    {
      key: 'ACCEPTED',
      label: 'Angenommen',
      count: mitStatus('ACCEPTED').length,
      sumCents: summe(mitStatus('ACCEPTED')),
    },
    {
      key: 'DECLINED',
      label: 'Abgelehnt',
      count: mitStatus('DECLINED').length,
      sumCents: summe(mitStatus('DECLINED')),
    },
  ];

  const aktionen = (quote: QuoteSummary): RowMenuItem[] => [
    { label: 'Öffnen', onSelect: () => navigate(`/angebote/${quote.id}`) },
    {
      label: 'PDF herunterladen',
      onSelect: () =>
        void downloadQuotePdf(quote.id, `Angebot-${quote.number}.pdf`).catch(
          fang,
        ),
    },
    {
      label: 'Kopieren',
      onSelect: () =>
        void duplicateQuote({ variables: { id: quote.id } })
          .then((result) => {
            const kopie = result.data?.duplicateQuote;

            if (kopie !== undefined) {
              navigate(`/angebote/${kopie.id}`);
            }
          })
          .catch(fang),
    },
    ...(quote.status === 'DRAFT'
      ? [
          {
            label: 'Entwurf löschen',
            danger: true,
            onSelect: () => setPendingDelete(quote),
          },
        ]
      : []),
  ];

  const handleSubmit = async (): Promise<boolean> => {
    const result = await createQuote({
      variables: {
        input: {
          ...(form.companyId === '' ? {} : { companyId: form.companyId }),
          ...(form.validUntil === '' ? {} : { validUntil: form.validUntil }),
        },
      },
    }).catch(() => null);

    const created = result?.data?.createQuote as { id: string } | undefined;

    if (created === undefined) {
      return false;
    }

    setForm(EMPTY_FORM);
    navigate(`/angebote/${created.id}`);

    return true;
  };

  return (
    <>
      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Angebot ${pendingDelete.number} löschen?`}
          consequence="Der Entwurf wird endgültig entfernt. Die Nummer kann an das nächste Angebot vergeben werden."
          confirmLabel="Entwurf löschen"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void deleteQuote({ variables: { id: pendingDelete.id } });
            setPendingDelete(null);
          }}
        />
      )}

      {schritt !== null && frage !== null && (
        <ConfirmDialog
          title={frage.titel}
          consequence={frage.folge}
          confirmLabel={frage.knopf}
          onCancel={() => {
            schritt.fertig(false);
            setSchritt(null);
          }}
          onConfirm={() => {
            const variables = { id: schritt.quote.id };

            schritt.fertig(
              schritt.art === 'senden'
                ? markQuoteSent({ variables })
                : decideQuote({
                    variables: {
                      ...variables,
                      accepted: schritt.art === 'annehmen',
                    },
                  }),
            );
            setSchritt(null);
          }}
        />
      )}

      <ObjectHeader
        hilfe="angebote"
        kind="quote"
        icon={IconQuotes}
        label={bez('ANGEBOT', 'mehrzahl')}
        anzahl={quotes.length}
        actions={
          <>
            <Link className="button button--ghost" to="/belege">
              Auftragsbestätigungen und Lieferscheine
            </Link>
            <Link className="button button--ghost" to="/artikel">
              Artikelstamm
            </Link>
            <DarstellungSchalter
              wert={alsBoard ? 'board' : 'liste'}
              arten={['liste', 'board']}
              onChange={(art) => setzeDarstellung({ art })}
            />
            <CreateButton create={create} label={bez('ANGEBOT', 'neu')} />
          </>
        }
      />

      {createError !== undefined && (
        <div className="error-banner">{createError.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel={`${bez('ANGEBOT')} anlegen`}
        submitting={creating}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="quote-company">{bez('FIRMA')}</label>
          <select
            id="quote-company"
            value={form.companyId}
            onChange={(event) =>
              setForm({ ...form, companyId: event.target.value })
            }
          >
            <option value="">— keine —</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quote-valid">Gültig bis</label>
          <input
            id="quote-valid"
            type="date"
            value={form.validUntil}
            onChange={(event) =>
              setForm({ ...form, validUntil: event.target.value })
            }
          />
          <p className="field__hint">Leer gelassen: 30 Tage.</p>
        </div>
      </CreatePanel>

      {!alsBoard && (
        <StatusTabs
          tabs={reiter}
          active={statusFilter}
          onChange={setStatusFilter}
        />
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {loading && data === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={6} />
        </>
      ) : alsBoard ? (
        <RecordBoard<QuoteSummary>
          kennung="angebote"
          feld={ANGEBOTS_STATUS_FELD}
          karten={quotes}
          id={(quote) => quote.id}
          titel={(quote) =>
            quote.company === null
              ? quote.number
              : `${quote.number} · ${quote.company.name}`
          }
          link={(quote) => `/angebote/${quote.id}`}
          wert={(quote) => quote.status}
          inhalt={(quote) => (
            <div className="board__card-foot">
              <span className="board__card-amount">
                {formatMoney(quote.totals.grossCents)}
              </span>
              <span className="board__card-date">
                bis {formatDate(quote.validUntil)}
              </span>
            </div>
          )}
          darfVerschieben={schrittRechte.senden || schrittRechte.aendern}
          zielErlaubt={(quote, ziel) =>
            angebotsSchritt(quote.status, ziel, schrittRechte) !== null
          }
          zielVerboten={(quote, ziel) =>
            angebotsSchrittVerboten(quote.status, ziel, schrittRechte)
          }
          verschieben={(quote, ziel) => {
            const art = angebotsSchritt(
              quote.status,
              ziel ?? '',
              schrittRechte,
            );

            if (art === null) {
              return Promise.resolve(false);
            }

            return new Promise<unknown>((fertig) =>
              setSchritt({ quote, art, fertig }),
            );
          }}
          weitere={0}
          mehrzahl="Angebote"
        />
      ) : shown.length === 0 ? (
        statusFilter === '' ? (
          <EmptyState
            title={bez('ANGEBOT', 'keine')}
            description={bez.leer(
              'ANGEBOT',
              'Ein Angebot ist das erste Dokument, das aus Stegwerk heraus zum Kunden geht. Legen Sie das erste an.',
            )}
            action={
              <button
                type="button"
                className="button"
                onClick={() => create.setOpen(true)}
              >
                {bez('ANGEBOT', 'ersten')} anlegen
              </button>
            }
          />
        ) : (
          <EmptyState
            title="Keine Treffer"
            description="In diesem Status liegt gerade nichts."
          />
        )
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>{bez('FIRMA')}</th>
                <th>Datum</th>
                <th>Gültig bis</th>
                <th className="numeric">Brutto</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((quote) => (
                <tr key={quote.id}>
                  <td data-label="Nummer">
                    <Link to={`/angebote/${quote.id}`}>{quote.number}</Link>
                  </td>
                  <td data-label={bez('FIRMA')}>
                    {quote.company?.name ?? '—'}
                  </td>
                  <td data-label="Datum">{formatDate(quote.issuedOn)}</td>
                  <td data-label="Gültig bis">
                    {formatDate(quote.validUntil)}
                  </td>
                  <td data-label="Brutto" className="numeric">
                    {formatMoney(quote.totals.grossCents)}
                  </td>
                  <td data-label="Status">
                    <span
                      className={quoteStatusBadgeClass(
                        quote.status as QuoteStatus,
                      )}
                    >
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </span>
                  </td>
                  <td className="row-menu">
                    <RowMenu
                      label={`Aktionen für ${quote.number}`}
                      items={aktionen(quote)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
};
