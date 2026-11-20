import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { BuchhaltungKarte } from '../components/BuchhaltungKarte';
import { InvoiceSeriesCard } from '../components/InvoiceSeriesCard';
import { PdfPreview } from '../components/PdfPreview';
import { SteuerbefreiungFelder } from '../components/SteuerbefreiungFelder';
import { LoadingAnnouncement } from '../components/Skeleton';
import { useMerkeBesuch } from '../lib/zuletzt';
import { downloadInvoicePdf, downloadInvoiceXRechnung } from '../lib/download';
import {
  CANCEL_INVOICE,
  DELETE_INVOICE,
  INVOICE,
  INVOICES,
  ISSUE_INVOICE,
  MARK_INVOICE_PAID,
  SET_INVOICE_LINES,
  UPDATE_INVOICE,
} from '../lib/queries';
import {
  formatDate,
  formatMoney,
  type Invoice,
  type InvoiceGap,
  type InvoiceLine,
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  PAYMENT_TERM_DAYS,
  QUOTE_UNITS,
  TAX_RATES,
} from '../lib/types';
import { LiveHinweis } from '../components/LiveHinweis';
import { AkteFehlt } from '../components/AkteFehlt';
import { TableWrap } from '../components/TableWrap';
import { AbhilfeLink } from '../components/AbhilfeLink';
import { IconArrowLeft } from '../components/Icons';

type Data = { invoice: Invoice; invoiceGaps: InvoiceGap[] };

type Zeile = {
  name: string;
  articleNumber: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: number;
};

const zuZeile = (line: InvoiceLine): Zeile => ({
  name: line.name,
  articleNumber: line.articleNumber ?? '',
  description: line.description ?? '',
  quantity: String(line.quantity),
  unit: line.unit,
  unitPrice: (line.unitPriceCents / 100).toFixed(2),
  discountPercent: String(line.discountPercent),
  taxRatePercent: line.taxRatePercent,
});

const LEERE_ZEILE: Zeile = {
  name: '',
  articleNumber: '',
  description: '',
  quantity: '1',
  unit: 'Stück',
  unitPrice: '0,00',
  discountPercent: '0',
  taxRatePercent: 19,
};

const zahl = (value: string): number =>
  Number(value.replace(/\./gu, '').replace(',', '.')) || 0;

export const InvoiceDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data, loading, error, refetch } = useQuery<Data>(INVOICE, {
    variables: { id },
  });
  const besuchtes = data?.invoice;
  useMerkeBesuch(
    besuchtes === undefined || besuchtes === null
      ? null
      : ((x) => ({
          to: `/rechnungen/${x.id}`,
          title: x.number ?? 'Rechnungsentwurf',
          art: 'Rechnung',
        }))(besuchtes),
  );

  const [updateInvoice] = useMutation(UPDATE_INVOICE);
  const [setLines, { loading: savingLines }] = useMutation(SET_INVOICE_LINES);
  const [issueInvoice, { loading: issuing }] = useMutation(ISSUE_INVOICE, {
    refetchQueries: [INVOICES],
  });
  const [markPaid] = useMutation(MARK_INVOICE_PAID, {
    refetchQueries: [INVOICES],
  });
  const [cancelInvoice] = useMutation(CANCEL_INVOICE, {
    refetchQueries: [INVOICES],
  });
  const [deleteInvoice] = useMutation(DELETE_INVOICE, {
    refetchQueries: [INVOICES],
  });

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [paymentTerm, setPaymentTerm] = useState(14);
  const [recipient, setRecipient] = useState('');
  const [buyerReference, setBuyerReference] = useState('');
  const [intro, setIntro] = useState('');
  const [closing, setClosing] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [frageStorno, setFrageStorno] = useState(false);
  const [frageLoeschen, setFrageLoeschen] = useState(false);

  const invoice = data?.invoice;
  const gaps = data?.invoiceGaps ?? [];
  const xrechnungLuecken = invoice?.xrechnungLuecken ?? [];
  const zugferdLuecken = invoice?.zugferdLuecken ?? [];
  const entwurf = invoice?.status === 'DRAFT';
  const mitZugferd =
    invoice !== undefined && !entwurf && zugferdLuecken.length === 0;

  useEffect(() => {
    if (invoice === undefined) {
      return;
    }

    setZeilen(invoice.lines.map(zuZeile));
    setServiceDate(invoice.serviceDate ?? '');
    setPaymentTerm(invoice.paymentTermDays);
    setRecipient(invoice.recipientAddress ?? '');
    setBuyerReference(invoice.buyerReference ?? '');
    setIntro(invoice.introText ?? '');
    setClosing(invoice.closingText ?? '');
  }, [invoice]);

  const lauf = async (was: () => Promise<unknown>): Promise<void> => {
    setFehler(null);

    try {
      await was();
      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined || invoice === undefined) {
    return (
      <AkteFehlt
        meldung={error?.message ?? 'Diese Rechnung gibt es nicht.'}
        zurueck={{ to: '/rechnungen', label: 'Zu den Rechnungen' }}
      />
    );
  }

  const kopfSpeichern = () =>
    lauf(() =>
      updateInvoice({
        variables: {
          input: {
            id: invoice.id,
            recipientAddress: recipient,
            buyerReference,
            serviceDate: serviceDate === '' ? undefined : serviceDate,
            paymentTermDays: paymentTerm,
            introText: intro,
            closingText: closing,
          },
        },
      }),
    );

  const zeilenSpeichern = () =>
    lauf(() =>
      setLines({
        variables: {
          input: {
            invoiceId: invoice.id,
            lines: zeilen
              .filter((zeile) => zeile.name.trim() !== '')
              .map((zeile) => ({
                name: zeile.name,
                articleNumber:
                  zeile.articleNumber === '' ? undefined : zeile.articleNumber,
                description:
                  zeile.description === '' ? undefined : zeile.description,
                quantity: zahl(zeile.quantity),
                unit: zeile.unit,
                unitPriceCents: Math.round(zahl(zeile.unitPrice) * 100),
                discountPercent: zahl(zeile.discountPercent),
                taxRatePercent: zeile.taxRatePercent,
              })),
          },
        },
      }),
    );

  return (
    <>
      <LiveHinweis objekt="invoice" id={invoice.id} />
      {frageStorno && (
        <ConfirmDialog
          title={`Rechnung ${invoice.number ?? ''} stornieren?`}
          consequence="Es entsteht eine Rechnungskorrektur mit eigener Nummer, die diesen Betrag zurücknimmt. Die Rechnung selbst bleibt erhalten, wie es die GoBD verlangen."
          confirmLabel="Stornieren"
          onCancel={() => setFrageStorno(false)}
          onConfirm={() => {
            setFrageStorno(false);
            void lauf(async () => {
              const antwort = await cancelInvoice({
                variables: { id: invoice.id },
              });
              const korrektur = antwort.data?.cancelInvoice as
                | { id: string }
                | undefined;

              if (korrektur !== undefined) {
                navigate(`/rechnungen/${korrektur.id}`);
              }
            });
          }}
        />
      )}

      {frageLoeschen && (
        <ConfirmDialog
          title="Entwurf löschen?"
          consequence="Der Entwurf hat noch keine Nummer getragen, also entsteht keine Lücke in der Nummernfolge."
          confirmLabel="Entwurf löschen"
          onCancel={() => setFrageLoeschen(false)}
          onConfirm={() => {
            setFrageLoeschen(false);
            void deleteInvoice({ variables: { id: invoice.id } }).then(() =>
              navigate('/rechnungen'),
            );
          }}
        />
      )}

      <div className="page__header">
        <div>
          <Link to="/rechnungen" className="back-link">
            <IconArrowLeft size={14} /> Rechnungen
          </Link>
          <h1>
            {invoice.number ?? 'Entwurf'}
            {invoice.correctsInvoiceId !== null && ' · Rechnungskorrektur'}
          </h1>
          <p className="page__subtitle">
            <span className={invoiceStatusBadgeClass(invoice.status)}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </span>{' '}
            · {formatDate(invoice.issuedOn)}
            {invoice.quoteId !== null && (
              <>
                {' · aus '}
                <Link to={`/angebote/${invoice.quoteId}`}>Angebot</Link>
              </>
            )}
          </p>
        </div>

        <div className="object-header__actions">
          {entwurf && (
            <button
              type="button"
              className="button"
              disabled={issuing || gaps.length > 0}
              onClick={() =>
                void lauf(() => issueInvoice({ variables: { id: invoice.id } }))
              }
            >
              {issuing ? 'Wird gestellt…' : 'Rechnung stellen'}
            </button>
          )}

          {invoice.status === 'ISSUED' && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void lauf(() => markPaid({ variables: { id: invoice.id } }))
              }
            >
              {invoice.correctsInvoiceId === null
                ? 'Als bezahlt buchen'
                : 'Erstattung gebucht'}
            </button>
          )}

          <button
            type="button"
            className="button button--ghost"
            title={
              mitZugferd
                ? 'PDF mit eingebetteter E-Rechnung (ZUGFeRD, EN 16931)'
                : 'PDF herunterladen'
            }
            onClick={() =>
              void downloadInvoicePdf(
                invoice.id,
                `Rechnung-${invoice.number ?? 'Entwurf'}.pdf`,
              ).catch((problem: Error) => setFehler(problem.message))
            }
          >
            {mitZugferd ? 'PDF (ZUGFeRD)' : 'PDF'}
          </button>

          {!entwurf && (
            <button
              type="button"
              className="button button--ghost"
              disabled={xrechnungLuecken.length > 0}
              title={
                xrechnungLuecken.length > 0
                  ? `Es fehlt noch: ${xrechnungLuecken.join(', ')}`
                  : 'XRechnung nach EN 16931 herunterladen'
              }
              onClick={() =>
                void downloadInvoiceXRechnung(
                  invoice.id,
                  `Rechnung-${invoice.number ?? ''}-XRechnung.xml`,
                ).catch((problem: Error) => setFehler(problem.message))
              }
            >
              XRechnung
            </button>
          )}

          {(invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
            invoice.correctsInvoiceId === null && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setFrageStorno(true)}
              >
                Stornieren
              </button>
            )}

          {entwurf && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => setFrageLoeschen(true)}
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {entwurf && gaps.length > 0 && (
        <div className="banner banner--warning">
          Vor dem Stellen fehlt noch: {gaps.map((gap) => gap.label).join(', ')}.
          Ohne diese Angaben ist das Papier keine Rechnung im Sinne von §14
          UStG, und Ihr Kunde kann die Vorsteuer daraus nicht ziehen.
        </div>
      )}

      {entwurf &&
        invoice.seriesId !== null &&
        invoice.seriesId !== undefined && (
          <div className="notice">
            Dieser Entwurf kommt aus einer wiederkehrenden Rechnung. Prüfen Sie
            Leistungsdatum und Positionen, dann stellen Sie ihn.
          </div>
        )}

      {!entwurf && zugferdLuecken.length > 0 && (
        <div className="banner banner--warning">
          Für die E-Rechnung fehlt noch: {zugferdLuecken.join(', ')}. Bis dahin
          ist das PDF ein gewöhnliches PDF. Seit 2025 muss jedes Unternehmen
          E-Rechnungen annehmen können; ab 2027 und 2028 wird sie auch beim
          Ausstellen Pflicht.
          <AbhilfeLink id="e-rechnung" />
        </div>
      )}

      {mitZugferd && xrechnungLuecken.length > 0 && (
        <div className="notice">
          Das PDF dieser Rechnung ist eine E-Rechnung (ZUGFeRD). Für die
          XRechnung, die etwa Behörden verlangen, fehlt noch:{' '}
          {xrechnungLuecken.join(', ')}.
        </div>
      )}

      {!entwurf && (
        <div className="invoice__locked">
          <span>
            Diese Rechnung ist gestellt und damit ein Beleg. Sie lässt sich
            nicht mehr ändern, wie es die GoBD verlangen. Was falsch ist, wird
            storniert und neu geschrieben.
          </span>
        </div>
      )}

      <div className="doc-layout">
        <div className="doc-layout__main">
          <section className="card">
            <h2>Empfänger und Fristen</h2>

            <dl className="invoice__facts">
              <div>
                <dt>Leistungsdatum</dt>
                <dd>
                  {invoice.serviceDate === null
                    ? '—'
                    : formatDate(invoice.serviceDate)}
                </dd>
              </div>
              <div>
                <dt>Zahlbar bis</dt>
                <dd>
                  {invoice.dueOn === null ? '—' : formatDate(invoice.dueOn)}
                </dd>
              </div>
              <div>
                <dt>Bruttobetrag</dt>
                <dd>{formatMoney(invoice.totals.grossCents)}</dd>
              </div>
              {invoice.paidAt !== null && (
                <div>
                  <dt>Bezahlt am</dt>
                  <dd>{formatDate(invoice.paidAt.slice(0, 10))}</dd>
                </div>
              )}
            </dl>

            {entwurf ? (
              <>
                <div className="mailbox__grid">
                  <div className="field field--wide">
                    <label htmlFor="invoice-recipient">Anschrift</label>
                    <textarea
                      id="invoice-recipient"
                      rows={4}
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="invoice-buyer-reference">
                      Käuferreferenz / Leitweg-ID
                    </label>
                    <input
                      id="invoice-buyer-reference"
                      value={buyerReference}
                      maxLength={100}
                      onChange={(event) =>
                        setBuyerReference(event.target.value)
                      }
                    />
                    <p className="field__hint">
                      Für die E-Rechnung. Behörden geben eine Leitweg-ID vor,
                      Firmen oft eine Bestellnummer. Leer steht dort die
                      Rechnungsnummer.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="invoice-service-date">Leistungsdatum</label>
                    <input
                      id="invoice-service-date"
                      type="date"
                      value={serviceDate}
                      onChange={(event) => setServiceDate(event.target.value)}
                    />
                    <p className="field__hint">
                      Wann geliefert oder geleistet wurde. §14 UStG verlangt das
                      getrennt vom Rechnungsdatum.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="invoice-term">Zahlungsziel</label>
                    <select
                      id="invoice-term"
                      value={paymentTerm}
                      onChange={(event) =>
                        setPaymentTerm(Number(event.target.value))
                      }
                    >
                      {PAYMENT_TERM_DAYS.map((days) => (
                        <option key={days} value={days}>
                          {days} Tage
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field field--wide">
                    <label htmlFor="invoice-intro">Einleitung</label>
                    <textarea
                      id="invoice-intro"
                      rows={3}
                      value={intro}
                      onChange={(event) => setIntro(event.target.value)}
                    />
                  </div>
                  <div className="field field--wide">
                    <label htmlFor="invoice-closing">Schluss</label>
                    <textarea
                      id="invoice-closing"
                      rows={2}
                      value={closing}
                      onChange={(event) => setClosing(event.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void kopfSpeichern()}
                >
                  Angaben speichern
                </button>

                <div className="mailbox__grid">
                  <SteuerbefreiungFelder
                    idPrefix="invoice"
                    werte={invoice}
                    smallBusiness={invoice.smallBusiness}
                    hatNullProzent={invoice.lines.some(
                      (line) => line.taxRatePercent === 0,
                    )}
                    disabled={false}
                    onSave={(teil) =>
                      void lauf(() =>
                        updateInvoice({
                          variables: { input: { id: invoice.id, ...teil } },
                        }),
                      )
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <p className="field__hint" style={{ whiteSpace: 'pre-line' }}>
                  {invoice.recipientAddress ?? '—'}
                </p>
                {invoice.buyerReference !== null && (
                  <p className="field__hint">
                    Käuferreferenz: {invoice.buyerReference}
                  </p>
                )}
                {invoice.taxExemption !== null && !invoice.smallBusiness && (
                  <div className="mailbox__grid">
                    <SteuerbefreiungFelder
                      idPrefix="invoice"
                      werte={invoice}
                      smallBusiness={false}
                      hatNullProzent
                      disabled
                      onSave={() => undefined}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>Positionen</h2>

            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th className="numeric">Menge</th>
                    <th>Einheit</th>
                    <th className="numeric">Einzelpreis</th>
                    <th className="numeric">Rabatt %</th>
                    <th className="numeric">MwSt.</th>
                    {entwurf && (
                      <th>
                        <span className="visually-hidden">Aktionen</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(entwurf ? zeilen : invoice.lines.map(zuZeile)).map(
                    (zeile, index) => (
                      <tr key={index}>
                        <td>
                          {entwurf ? (
                            <input
                              value={zeile.name}
                              aria-label={`Bezeichnung Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? { ...andere, name: event.target.value }
                                      : andere,
                                  ),
                                )
                              }
                            />
                          ) : (
                            zeile.name
                          )}
                        </td>
                        <td className="numeric">
                          {entwurf ? (
                            <input
                              className="numeric"
                              value={zeile.quantity}
                              aria-label={`Menge Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? {
                                          ...andere,
                                          quantity: event.target.value,
                                        }
                                      : andere,
                                  ),
                                )
                              }
                            />
                          ) : (
                            zeile.quantity
                          )}
                        </td>
                        <td>
                          {entwurf ? (
                            <select
                              value={zeile.unit}
                              aria-label={`Einheit Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? { ...andere, unit: event.target.value }
                                      : andere,
                                  ),
                                )
                              }
                            >
                              {QUOTE_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                            </select>
                          ) : (
                            zeile.unit
                          )}
                        </td>
                        <td className="numeric">
                          {entwurf ? (
                            <input
                              className="numeric"
                              value={zeile.unitPrice}
                              aria-label={`Einzelpreis Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? {
                                          ...andere,
                                          unitPrice: event.target.value,
                                        }
                                      : andere,
                                  ),
                                )
                              }
                            />
                          ) : (
                            zeile.unitPrice
                          )}
                        </td>
                        <td className="numeric">
                          {entwurf ? (
                            <input
                              className="numeric"
                              value={zeile.discountPercent}
                              aria-label={`Rabatt Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? {
                                          ...andere,
                                          discountPercent: event.target.value,
                                        }
                                      : andere,
                                  ),
                                )
                              }
                            />
                          ) : (
                            zeile.discountPercent
                          )}
                        </td>
                        <td className="numeric">
                          {entwurf ? (
                            <select
                              value={zeile.taxRatePercent}
                              aria-label={`MwSt Zeile ${String(index + 1)}`}
                              onChange={(event) =>
                                setZeilen(
                                  zeilen.map((andere, andererIndex) =>
                                    andererIndex === index
                                      ? {
                                          ...andere,
                                          taxRatePercent: Number(
                                            event.target.value,
                                          ),
                                        }
                                      : andere,
                                  ),
                                )
                              }
                            >
                              {TAX_RATES.map((rate) => (
                                <option key={rate} value={rate}>
                                  {rate} %
                                </option>
                              ))}
                            </select>
                          ) : (
                            `${zeile.taxRatePercent} %`
                          )}
                        </td>
                        {entwurf && (
                          <td>
                            <button
                              type="button"
                              className="button button--danger row-action"
                              onClick={() =>
                                setZeilen(
                                  zeilen.filter(
                                    (_, andererIndex) => andererIndex !== index,
                                  ),
                                )
                              }
                            >
                              Entfernen
                            </button>
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </TableWrap>

            {entwurf && (
              <div className="row-actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setZeilen([...zeilen, { ...LEERE_ZEILE }])}
                >
                  Zeile hinzufügen
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={savingLines}
                  onClick={() => void zeilenSpeichern()}
                >
                  {savingLines ? 'Wird gespeichert…' : 'Positionen speichern'}
                </button>
              </div>
            )}

            <dl className="invoice__facts">
              <div>
                <dt>Nettobetrag</dt>
                <dd>{formatMoney(invoice.totals.netCents)}</dd>
              </div>
              {invoice.totals.taxGroups.map((group) => (
                <div key={group.ratePercent}>
                  <dt>Umsatzsteuer {group.ratePercent} %</dt>
                  <dd>{formatMoney(group.taxCents)}</dd>
                </div>
              ))}
              <div>
                <dt>Gesamtbetrag</dt>
                <dd>{formatMoney(invoice.totals.grossCents)}</dd>
              </div>
            </dl>

            {invoice.smallBusiness && (
              <p className="field__hint">
                Gemäß §19 UStG wird keine Umsatzsteuer berechnet.
              </p>
            )}
          </section>

          {!entwurf && <BuchhaltungKarte invoice={invoice} />}

          {invoice.correctsInvoiceId === null && (
            <InvoiceSeriesCard invoice={invoice} />
          )}
        </div>
        <aside className="doc-layout__preview">
          <PdfPreview
            path={`/invoices/${invoice.id}/pdf`}
            version={JSON.stringify(invoice)}
          />
        </aside>
      </div>
    </>
  );
};
