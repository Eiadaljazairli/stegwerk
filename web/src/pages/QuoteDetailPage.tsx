import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AngebotBelege } from '../components/Begleitbelege';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconClose,
  IconDownload,
} from '../components/Icons';
import { PdfPreview } from '../components/PdfPreview';
import { QuoteLinkCard } from '../components/QuoteLinkCard';
import { SteuerbefreiungFelder } from '../components/SteuerbefreiungFelder';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useMerkeBesuch } from '../lib/zuletzt';
import { downloadQuotePdf } from '../lib/download';
import {
  DECIDE_QUOTE,
  CREATE_INVOICE_FROM_QUOTE,
  DUPLICATE_QUOTE,
  MARK_QUOTE_SENT,
  PRODUCTS,
  QUOTE,
  QUOTES,
  SET_QUOTE_LINES,
  UPDATE_QUOTE,
} from '../lib/queries';
import {
  formatDate,
  formatMoney,
  parseMoneyToCents,
  parseQuantity,
  type Product,
  type Quote,
  QUOTE_STATUS_LABELS,
  QUOTE_UNITS,
  quoteStatusBadgeClass,
  TAX_RATES,
} from '../lib/types';
import { LiveHinweis } from '../components/LiveHinweis';
import { AkteFehlt } from '../components/AkteFehlt';
import { KiEntwurfKnopf } from '../components/KiEntwurfKnopf';
import { KiVorschlagHinweis } from '../components/KiVorschlagHinweis';
import { TableWrap } from '../components/TableWrap';
import { useBezeichnung } from '../lib/useBezeichnung';

type DraftLine = {
  key: string;
  productId: string | null;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: number;
};

const QuoteText = ({
  label,
  value,
  rows,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  rows: number;
  disabled: boolean;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  if (!editing && draft !== value) {
    setDraft(value);
  }

  return (
    <textarea
      aria-label={label}
      rows={rows}
      disabled={disabled}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);

        if (draft !== value) {
          onCommit(draft);
        }
      }}
    />
  );
};

let keyCounter = 0;
const nextKey = () => {
  keyCounter += 1;

  return `line-${String(keyCounter)}`;
};

const toDraft = (line: Quote['lines'][number]): DraftLine => ({
  key: nextKey(),
  productId: line.productId,
  name: line.name,
  description: line.description ?? '',
  quantity: String(line.quantity).replace('.', ','),
  unit: line.unit,
  unitPrice: (line.unitPriceCents / 100).toFixed(2).replace('.', ','),
  discountPercent: String(line.discountPercent).replace('.', ','),
  taxRatePercent: line.taxRatePercent,
});

const blankLine = (): DraftLine => ({
  key: nextKey(),
  productId: null,
  name: '',
  description: '',
  quantity: '1',
  unit: 'Stück',
  unitPrice: '0,00',
  discountPercent: '0',
  taxRatePercent: 19,
});

export const QuoteDetailPage = () => {
  const bez = useBezeichnung();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'send' | 'decline' | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, loading, error } = useQuery<{ quote: Quote }>(QUOTE, {
    variables: { id },
  });
  const besuchtes = data?.quote;
  useMerkeBesuch(
    besuchtes === undefined || besuchtes === null
      ? null
      : ((x) => ({
          to: `/angebote/${x.id}`,
          title: x.number ?? 'Angebotsentwurf',
          art: bez('ANGEBOT'),
        }))(besuchtes),
  );
  const { data: productData } = useQuery<{ products: Product[] }>(PRODUCTS);

  const quote = data?.quote;
  const editable = quote?.status === 'DRAFT';

  useEffect(() => {
    if (quote !== undefined && !dirty) {
      setLines(quote.lines.map(toDraft));
    }
  }, [quote, dirty]);

  const refetchQueries = [QUOTE, QUOTES];
  const [setQuoteLines, { loading: saving }] = useMutation(SET_QUOTE_LINES);
  const [updateQuote] = useMutation(UPDATE_QUOTE);
  const [markQuoteSent] = useMutation(MARK_QUOTE_SENT, { refetchQueries });
  const [decideQuote] = useMutation(DECIDE_QUOTE, { refetchQueries });
  const [duplicateQuote] = useMutation(DUPLICATE_QUOTE, { refetchQueries });
  const [createInvoiceFromQuote] = useMutation(CREATE_INVOICE_FROM_QUOTE);

  const patch = (key: string, change: Partial<DraftLine>) => {
    setDirty(true);
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  };

  const move = (index: number, by: number) => {
    const target = index + by;

    if (target < 0 || target >= lines.length) {
      return;
    }

    const reordered = [...lines];

    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    setDirty(true);
    setLines(reordered);
  };

  const addFromProduct = (productId: string) => {
    const product = productData?.products.find((row) => row.id === productId);

    if (product === undefined) {
      return;
    }

    setDirty(true);
    setLines([
      ...lines,
      {
        ...blankLine(),
        productId: product.id,
        name: product.name,
        description: product.description ?? '',
        unit: product.unit,
        unitPrice: (product.unitPriceCents / 100).toFixed(2).replace('.', ','),
        taxRatePercent: product.taxRatePercent,
      },
    ]);
  };

  const save = async () => {
    setLineError(null);

    const converted = [];

    for (const [index, line] of lines.entries()) {
      const quantity = parseQuantity(line.quantity);
      const unitPriceCents = parseMoneyToCents(line.unitPrice);
      const discountPercent = parseQuantity(line.discountPercent) ?? 0;

      if (line.name.trim() === '') {
        setLineError(`Zeile ${String(index + 1)} braucht eine Bezeichnung.`);

        return;
      }

      if (quantity === null || quantity <= 0) {
        setLineError(`Zeile ${String(index + 1)}: Menge prüfen.`);

        return;
      }

      if (unitPriceCents === null || unitPriceCents < 0) {
        setLineError(`Zeile ${String(index + 1)}: Preis prüfen.`);

        return;
      }

      converted.push({
        ...(line.productId === null ? {} : { productId: line.productId }),
        name: line.name.trim(),
        ...(line.description.trim() === ''
          ? {}
          : { description: line.description.trim() }),
        quantity,
        unit: line.unit,
        unitPriceCents,
        discountPercent,
        taxRatePercent: line.taxRatePercent,
      });
    }

    const result = await setQuoteLines({
      variables: { input: { quoteId: id, lines: converted } },
    }).catch((thrown: Error) => {
      setLineError(thrown.message);

      return null;
    });

    if (result !== null) {
      setDirty(false);
    }
  };

  if (loading && quote === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/angebote', label: 'Zu den Angeboten' }}
      />
    );
  }

  if (quote === undefined) {
    return null;
  }

  const products = productData?.products ?? [];

  return (
    <>
      <LiveHinweis objekt="quote" id={quote.id} />
      {confirming === 'send' && (
        <ConfirmDialog
          title={`Angebot ${quote.number} als versendet markieren?`}
          consequence="Danach lässt sich nichts mehr daran ändern. Für eine neue Fassung kopieren Sie das Angebot."
          confirmLabel="Als versendet markieren"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void markQuoteSent({ variables: { id } });
            setConfirming(null);
          }}
        />
      )}

      {confirming === 'decline' && (
        <ConfirmDialog
          title={`Angebot ${quote.number} als abgelehnt eintragen?`}
          consequence="Der Eintrag lässt sich danach nicht mehr ändern."
          confirmLabel="Als abgelehnt eintragen"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void decideQuote({ variables: { id, accepted: false } });
            setConfirming(null);
          }}
        />
      )}

      <div className="page__header">
        <div>
          <Link className="back-link" to="/angebote">
            <IconArrowLeft size={14} /> {bez('ANGEBOT', 'mehrzahl')}
          </Link>
          <h1>{quote.number}</h1>
          <p className="page__subtitle">
            <span className={quoteStatusBadgeClass(quote.status)}>
              {QUOTE_STATUS_LABELS[quote.status]}
            </span>{' '}
            · {formatDate(quote.issuedOn)}
            {quote.sentAt !== null &&
              ` · versendet ${formatDate(quote.sentAt)}`}
          </p>
        </div>

        <div className="quote__actions">
          {editable && (
            <button
              type="button"
              className="button"
              disabled={quote.lines.length === 0 || dirty}
              title={
                dirty
                  ? 'Erst speichern'
                  : quote.lines.length === 0
                    ? 'Ein Angebot ohne Positionen ist kein Angebot'
                    : undefined
              }
              onClick={() => setConfirming('send')}
            >
              Als versendet markieren
            </button>
          )}
          {quote.status === 'SENT' && (
            <>
              <button
                type="button"
                className="button"
                onClick={() =>
                  void decideQuote({ variables: { id, accepted: true } })
                }
              >
                Angenommen
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setConfirming('decline')}
              >
                Abgelehnt
              </button>
            </>
          )}
          <button
            type="button"
            className="button button--ghost"
            disabled={downloading}
            onClick={() => {
              setPdfError(null);
              setDownloading(true);
              void downloadQuotePdf(id, `Angebot-${quote.number}.pdf`)
                .catch((thrown: Error) => setPdfError(thrown.message))
                .finally(() => setDownloading(false));
            }}
          >
            <IconDownload size={15} />
            {downloading ? 'PDF wird erstellt…' : 'PDF'}
          </button>
          {(quote.status === 'SENT' || quote.status === 'ACCEPTED') && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void createInvoiceFromQuote({
                  variables: { quoteId: id },
                }).then((result) => {
                  const created = result.data?.createInvoiceFromQuote as
                    | { id: string }
                    | undefined;

                  if (created !== undefined) {
                    navigate(`/rechnungen/${created.id}`);
                  }
                })
              }
            >
              Rechnung erstellen
            </button>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              void duplicateQuote({ variables: { id } }).then((result) => {
                const copy = result.data?.duplicateQuote as
                  | { id: string }
                  | undefined;

                if (copy !== undefined) {
                  navigate(`/angebote/${copy.id}`);
                }
              })
            }
          >
            Kopieren
          </button>
        </div>
      </div>

      {pdfError !== null && <div className="error-banner">{pdfError}</div>}

      <KiVorschlagHinweis art="quote" id={quote.id} />

      {!editable && (
        <div className="notice">
          Dieses Angebot ist beim Kunden. Es lässt sich nicht mehr ändern —
          <strong> Kopieren</strong> legt eine neue Fassung mit eigener Nummer
          an.
        </div>
      )}

      {!editable && <QuoteLinkCard quote={quote} />}

      {!editable && <AngebotBelege angebot={quote} />}

      <div className="doc-layout">
        <div className="doc-layout__main">
          <div className="quote__meta">
            <div className="card">
              <h2>Empfänger</h2>
              <QuoteText
                label="Empfängeranschrift"
                rows={4}
                disabled={!editable}
                value={quote.recipientAddress ?? ''}
                onCommit={(next) =>
                  void updateQuote({
                    variables: { input: { id, recipientAddress: next } },
                  })
                }
              />
              {quote.company !== null && (
                <p className="field__hint">
                  Aus{' '}
                  <Link to={`/firmen/${quote.company.id}`}>
                    {quote.company.name}
                  </Link>{' '}
                  übernommen. Änderungen dort wirken nicht zurück.
                </p>
              )}
            </div>

            <div className="card">
              <h2>Gültigkeit</h2>
              <div className="field">
                <label htmlFor="quote-valid-until">Gültig bis</label>
                <input
                  id="quote-valid-until"
                  type="date"
                  disabled={!editable}
                  value={quote.validUntil}
                  onChange={(event) =>
                    void updateQuote({
                      variables: {
                        input: { id, validUntil: event.target.value },
                      },
                    })
                  }
                />
              </div>
              {quote.smallBusiness && (
                <p className="field__hint">
                  Kleinunternehmer nach §19 UStG — es wird keine Umsatzsteuer
                  ausgewiesen.
                </p>
              )}
            </div>

            {!quote.smallBusiness && (
              <div className="card">
                <h2>Umsatzsteuer</h2>
                <SteuerbefreiungFelder
                  idPrefix="quote"
                  werte={quote}
                  smallBusiness={quote.smallBusiness}
                  hatNullProzent={quote.lines.some(
                    (line) => line.taxRatePercent === 0,
                  )}
                  disabled={!editable}
                  onSave={(teil) =>
                    void updateQuote({
                      variables: { input: { id, ...teil } },
                    })
                  }
                />
              </div>
            )}
          </div>

          <div className="card">
            <div className="quote__text-kopf">
              <h2>Einleitung</h2>
              {editable && (
                <KiEntwurfKnopf
                  art="angebot_einleitung"
                  titel="Einleitung"
                  bezug={{ art: 'quote', id }}
                  bisher={quote.introText ?? ''}
                  onUebernehmen={(text) =>
                    updateQuote({
                      variables: { input: { id, introText: text } },
                    })
                  }
                />
              )}
            </div>
            <QuoteText
              label="Einleitungstext"
              rows={3}
              disabled={!editable}
              value={quote.introText ?? ''}
              onCommit={(next) =>
                void updateQuote({
                  variables: { input: { id, introText: next } },
                })
              }
            />
          </div>

          <div className="page__header page__header--inline">
            <h2>Positionen</h2>
            {editable && (
              <div className="quote__actions">
                <select
                  aria-label="Aus Artikelstamm übernehmen"
                  value=""
                  onChange={(event) => {
                    addFromProduct(event.target.value);
                  }}
                >
                  <option value="">Aus Artikelstamm…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {formatMoney(product.unitPriceCents)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setDirty(true);
                    setLines([...lines, blankLine()]);
                  }}
                >
                  Zeile hinzufügen
                </button>
              </div>
            )}
          </div>

          {lineError !== null && (
            <div className="error-banner">{lineError}</div>
          )}

          <TableWrap>
            <table className="quote__lines">
              <thead>
                <tr>
                  <th className="quote__pos">Pos.</th>
                  <th>Bezeichnung</th>
                  <th className="numeric">Menge</th>
                  <th>Einheit</th>
                  <th className="numeric">Einzelpreis</th>
                  <th className="numeric">Rabatt %</th>
                  <th className="numeric">MwSt.</th>
                  {editable && (
                    <th>
                      <span className="visually-hidden">Aktionen</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.key}>
                    <td className="quote__pos">{index + 1}</td>
                    <td>
                      <input
                        className="quote__name-input"
                        aria-label={`Bezeichnung Zeile ${String(index + 1)}`}
                        disabled={!editable}
                        value={line.name}
                        onChange={(event) =>
                          patch(line.key, { name: event.target.value })
                        }
                      />
                      <input
                        className="quote__line-description"
                        aria-label={`Beschreibung Zeile ${String(index + 1)}`}
                        placeholder="Beschreibung (optional)"
                        disabled={!editable}
                        value={line.description}
                        onChange={(event) =>
                          patch(line.key, { description: event.target.value })
                        }
                      />
                    </td>
                    <td className="numeric">
                      <input
                        className="quote__number-input"
                        aria-label={`Menge Zeile ${String(index + 1)}`}
                        inputMode="decimal"
                        disabled={!editable}
                        value={line.quantity}
                        onChange={(event) =>
                          patch(line.key, { quantity: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Einheit Zeile ${String(index + 1)}`}
                        disabled={!editable}
                        value={line.unit}
                        onChange={(event) =>
                          patch(line.key, { unit: event.target.value })
                        }
                      >
                        {QUOTE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="numeric">
                      <input
                        className="quote__number-input"
                        aria-label={`Einzelpreis Zeile ${String(index + 1)}`}
                        inputMode="decimal"
                        disabled={!editable}
                        value={line.unitPrice}
                        onChange={(event) =>
                          patch(line.key, { unitPrice: event.target.value })
                        }
                      />
                    </td>
                    <td className="numeric">
                      <input
                        className="quote__number-input"
                        aria-label={`Rabatt Zeile ${String(index + 1)}`}
                        inputMode="decimal"
                        disabled={!editable}
                        value={line.discountPercent}
                        onChange={(event) =>
                          patch(line.key, {
                            discountPercent: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="numeric">
                      <select
                        aria-label={`Steuersatz Zeile ${String(index + 1)}`}
                        disabled={!editable}
                        value={line.taxRatePercent}
                        onChange={(event) =>
                          patch(line.key, {
                            taxRatePercent: Number(event.target.value),
                          })
                        }
                      >
                        {TAX_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate} %
                          </option>
                        ))}
                      </select>
                    </td>
                    {editable && (
                      <td className="quote__row-actions">
                        <button
                          type="button"
                          className="button button--ghost row-action"
                          aria-label={`Zeile ${String(index + 1)} nach oben`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <IconArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="button button--ghost row-action"
                          aria-label={`Zeile ${String(index + 1)} nach unten`}
                          disabled={index === lines.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <IconArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="button button--danger row-action"
                          aria-label={`Zeile ${String(index + 1)} entfernen`}
                          onClick={() => {
                            setDirty(true);
                            setLines(
                              lines.filter((row) => row.key !== line.key),
                            );
                          }}
                        >
                          <IconClose size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td className="quote__empty" colSpan={editable ? 8 : 7}>
                      Noch keine Positionen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>

          {editable && (
            <div className="quote__save">
              <button
                type="button"
                className="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? 'Wird gespeichert…' : 'Positionen speichern'}
              </button>
              {dirty && (
                <span className="quote__dirty">
                  Nicht gespeichert. Die Summen unten zeigen den gespeicherten
                  Stand.
                </span>
              )}
            </div>
          )}

          <div
            className={
              dirty ? 'card quote__totals is-stale' : 'card quote__totals'
            }
          >
            <h2>Summen</h2>
            <dl>
              <div>
                <dt>Nettobetrag</dt>
                <dd>{formatMoney(quote.totals.netCents, quote.currency)}</dd>
              </div>
              {quote.totals.taxGroups.map((group) => (
                <div key={group.ratePercent}>
                  <dt>
                    {quote.smallBusiness
                      ? 'Ohne Umsatzsteuer (§19 UStG)'
                      : `Umsatzsteuer ${String(group.ratePercent)} % auf ${formatMoney(group.netCents, quote.currency)}`}
                  </dt>
                  <dd>{formatMoney(group.taxCents, quote.currency)}</dd>
                </div>
              ))}
              <div className="quote__gross">
                <dt>Gesamtbetrag</dt>
                <dd>{formatMoney(quote.totals.grossCents, quote.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <div className="quote__text-kopf">
              <h2>Schluss</h2>
              {editable && (
                <KiEntwurfKnopf
                  art="angebot_schluss"
                  titel="Schluss"
                  bezug={{ art: 'quote', id }}
                  bisher={quote.closingText ?? ''}
                  onUebernehmen={(text) =>
                    updateQuote({
                      variables: { input: { id, closingText: text } },
                    })
                  }
                />
              )}
            </div>
            <QuoteText
              label="Schlusstext"
              rows={3}
              disabled={!editable}
              value={quote.closingText ?? ''}
              onCommit={(next) =>
                void updateQuote({
                  variables: { input: { id, closingText: next } },
                })
              }
            />
          </div>
        </div>
        <aside className="doc-layout__preview">
          <PdfPreview
            path={`/quotes/${quote.id}/pdf`}
            version={JSON.stringify(quote)}
          />
        </aside>
      </div>
    </>
  );
};
