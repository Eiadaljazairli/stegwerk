import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AkteFehlt } from '../components/AkteFehlt';
import { IconArrowLeft, IconDownload, IconMail } from '../components/Icons';
import { MailFormular } from '../components/MailFormular';
import { useKannSenden } from '../components/NeueMail';
import { PdfPreview } from '../components/PdfPreview';
import { LoadingAnnouncement } from '../components/Skeleton';
import { TableWrap } from '../components/TableWrap';
import { useToast } from '../components/Toast';
import {
  BEGLEITBELEG_DATEI,
  type Begleitbeleg,
  begleitbelegBadge,
  begleitbelegTitel,
  formatMenge,
} from '../lib/begleitbelege';
import { downloadBegleitbelegPdf } from '../lib/download';
import {
  ATTACHMENTS,
  BEGLEITBELEG,
  BEGLEITBELEG_ALS_ANHANG,
  BEGLEITBELEG_STORNIEREN,
  BEGLEITBELEGE,
  COMPANY_MESSAGES,
  CONTACT_MESSAGES,
  DEAL_MESSAGES,
} from '../lib/queries';
import { formatDate, formatMoney } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';
import { useMerkeBesuch } from '../lib/zuletzt';

const fehlerText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : 'Unbekannter Fehler.';

const StornoDialog = ({
  beleg,
  schliessen,
}: {
  beleg: Begleitbeleg;
  schliessen: () => void;
}) => {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abbrechenRef = useRef<HTMLButtonElement>(null);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [stornieren, { loading }] = useMutation<{
    begleitbelegStornieren: { id: string };
  }>(BEGLEITBELEG_STORNIEREN, {
    refetchQueries: [BEGLEITBELEG, BEGLEITBELEGE],
  });

  useEffect(() => {
    dialogRef.current?.showModal();
    abbrechenRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-label={`${begleitbelegTitel(beleg)} ${beleg.number} stornieren`}
      onCancel={(event) => {
        event.preventDefault();
        schliessen();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__title">
          {begleitbelegTitel(beleg)} {beleg.number} stornieren?
        </div>
        <p className="dialog__consequence">
          Der Beleg bleibt erhalten und wird als storniert markiert. Dazu
          entsteht ein Stornobeleg mit eigener Nummer, den Sie dem Kunden
          schicken können.
          {beleg.art === 'LIEFERSCHEIN' &&
            ' Die gelieferten Mengen gelten danach wieder als offen.'}
        </p>
        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
          </div>
        )}
        <div className="field">
          <label htmlFor="storno-grund">Grund</label>
          <textarea
            id="storno-grund"
            rows={2}
            maxLength={500}
            value={grund}
            onChange={(event) => setGrund(event.target.value)}
          />
          <p className="field__hint">Steht auf dem Stornobeleg.</p>
        </div>
        <div className="dialog__actions">
          <button
            ref={abbrechenRef}
            type="button"
            className="button button--ghost"
            onClick={schliessen}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="button button--destructive"
            disabled={loading}
            onClick={() => {
              setFehler(null);
              void stornieren({
                variables: {
                  id: beleg.id,
                  grund: grund.trim() === '' ? null : grund.trim(),
                },
              })
                .then((result) => {
                  const storno = result.data?.begleitbelegStornieren;

                  if (storno !== undefined) {
                    schliessen();
                    navigate(`/belege/${storno.id}`);
                  }
                })
                .catch((problem: unknown) => setFehler(fehlerText(problem)));
            }}
          >
            Stornieren
          </button>
        </div>
      </div>
    </dialog>
  );
};

const MailDialog = ({
  beleg,
  anhangId,
  schliessen,
}: {
  beleg: Begleitbeleg;
  anhangId: string;
  schliessen: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const client = useApolloClient();
  const { zeige } = useToast();
  const kontakt = beleg.contact;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--mail"
      aria-label={`${begleitbelegTitel(beleg)} per E-Mail senden`}
      onCancel={(event) => {
        event.preventDefault();
        schliessen();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__title">
          {begleitbelegTitel(beleg)} {beleg.number} senden
        </div>
        <MailFormular
          kennung="beleg"
          ziel={{ quoteId: beleg.angebotId }}
          werte={{
            vorname: kontakt?.firstName ?? null,
            nachname: kontakt?.lastName ?? null,
            firma: beleg.company?.name ?? null,
          }}
          vorgabeAn={kontakt?.email ?? ''}
          vorgabeBetreff={`${begleitbelegTitel(beleg)} ${beleg.number}`}
          vorgewaehlt={[anhangId]}
          gesendet={async () => {
            schliessen();
            zeige({ text: 'Verschickt. Die Mail steht jetzt im Verlauf.' });
            await client.refetchQueries({
              include: [CONTACT_MESSAGES, COMPANY_MESSAGES, DEAL_MESSAGES],
            });
          }}
          abbrechen={schliessen}
        />
      </div>
    </dialog>
  );
};

export const BegleitbelegDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const client = useApolloClient();
  const { can } = usePermissions();
  const { kannSenden } = useKannSenden();
  const [stornoOffen, setStornoOffen] = useState(false);
  const [mailAnhang, setMailAnhang] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const { data, loading, error } = useQuery<{ begleitbeleg: Begleitbeleg }>(
    BEGLEITBELEG,
    { variables: { id } },
  );
  const [alsAnhang] = useMutation<{
    begleitbelegAlsAnhang: { id: string };
  }>(BEGLEITBELEG_ALS_ANHANG);
  const beleg = data?.begleitbeleg;

  useMerkeBesuch(
    beleg === undefined
      ? null
      : {
          to: `/belege/${beleg.id}`,
          title: beleg.number,
          art: begleitbelegTitel(beleg),
        },
  );

  if (loading && beleg === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/belege', label: 'Zu den Belegen' }}
      />
    );
  }

  if (beleg === undefined) {
    return null;
  }

  const lieferschein = beleg.art === 'LIEFERSCHEIN';
  const istStorno = beleg.stornoVonId !== null;
  const badge = begleitbelegBadge(beleg);
  const titel = begleitbelegTitel(beleg);
  const dateiname = `${istStorno ? 'Storno-' : ''}${BEGLEITBELEG_DATEI[beleg.art]}-${beleg.number}.pdf`;
  const mitRest = beleg.positionen.some(
    (position) => (position.restOffen ?? 0) > 0,
  );

  const mailOeffnen = async () => {
    setFehler(null);
    setArbeitet(true);

    try {
      const result = await alsAnhang({ variables: { id: beleg.id } });
      const anhang = result.data?.begleitbelegAlsAnhang;

      if (anhang === undefined) {
        return;
      }

      await client.query({
        query: ATTACHMENTS,
        variables: { quoteId: beleg.angebotId },
        fetchPolicy: 'network-only',
      });
      setMailAnhang(anhang.id);
    } catch (problem) {
      setFehler(fehlerText(problem));
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <>
      {stornoOffen && (
        <StornoDialog beleg={beleg} schliessen={() => setStornoOffen(false)} />
      )}
      {mailAnhang !== null && (
        <MailDialog
          beleg={beleg}
          anhangId={mailAnhang}
          schliessen={() => setMailAnhang(null)}
        />
      )}

      <div className="page__header">
        <div>
          <Link className="back-link" to="/belege">
            <IconArrowLeft size={14} /> Belege
          </Link>
          <h1>
            {titel} {beleg.number}
          </h1>
          <p className="page__subtitle">
            <span className={badge.className}>{badge.text}</span> ·{' '}
            {formatDate(beleg.issuedOn)} · zum Angebot{' '}
            <Link to={`/angebote/${beleg.angebot.id}`}>
              {beleg.angebot.number}
            </Link>
          </p>
        </div>

        <div className="quote__actions">
          <button
            type="button"
            className="button button--ghost"
            disabled={arbeitet}
            onClick={() => {
              setFehler(null);
              setArbeitet(true);
              void downloadBegleitbelegPdf(beleg.id, dateiname)
                .catch((problem: unknown) => setFehler(fehlerText(problem)))
                .finally(() => setArbeitet(false));
            }}
          >
            <IconDownload size={15} />
            PDF
          </button>
          {can('quote:send') && (
            <button
              type="button"
              className="button"
              disabled={arbeitet || !kannSenden}
              title={
                kannSenden
                  ? undefined
                  : 'Für Ihr Postfach ist kein Postausgang eingetragen.'
              }
              onClick={() => void mailOeffnen()}
            >
              <IconMail />
              Per E-Mail senden
            </button>
          )}
          {can('quote:send') && !istStorno && beleg.status === 'GESTELLT' && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setStornoOffen(true)}
            >
              Stornieren
            </button>
          )}
        </div>
      </div>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {beleg.status === 'STORNIERT' && (
        <div className="notice">
          Storniert am {formatDate(beleg.storniertAm)}
          {beleg.stornoGrund !== null && ` — ${beleg.stornoGrund}`}.
        </div>
      )}
      {istStorno && beleg.stornoVon !== null && (
        <div className="notice">
          Dieser Beleg storniert{' '}
          <Link to={`/belege/${beleg.stornoVon.id}`}>
            {beleg.stornoVon.number}
          </Link>
          {beleg.stornoGrund !== null && ` — ${beleg.stornoGrund}`}.
        </div>
      )}

      <div className="doc-layout">
        <div className="doc-layout__main">
          <div className="card">
            <h2>Angaben</h2>
            <dl className="beleg-angaben">
              <div>
                <dt>Empfänger</dt>
                <dd className="beleg-angaben__anschrift">
                  {beleg.recipientAddress ?? '—'}
                </dd>
              </div>
              {lieferschein && (
                <div>
                  <dt>Lieferanschrift</dt>
                  <dd className="beleg-angaben__anschrift">
                    {beleg.lieferadresse ?? 'wie Empfänger'}
                  </dd>
                </div>
              )}
              <div>
                <dt>{lieferschein ? 'Lieferdatum' : 'Liefertermin'}</dt>
                <dd>
                  {beleg.liefertermin === null
                    ? '—'
                    : formatDate(beleg.liefertermin)}
                </dd>
              </div>
              {beleg.auftragsbestaetigung !== null && (
                <div>
                  <dt>Auftragsbestätigung</dt>
                  <dd>
                    <Link to={`/belege/${beleg.auftragsbestaetigung.id}`}>
                      {beleg.auftragsbestaetigung.number}
                    </Link>
                  </dd>
                </div>
              )}
              {beleg.company !== null && (
                <div>
                  <dt>Firma</dt>
                  <dd>
                    <Link to={`/firmen/${beleg.company.id}`}>
                      {beleg.company.name}
                    </Link>
                  </dd>
                </div>
              )}
              {beleg.deal !== null && (
                <div>
                  <dt>Geschäft</dt>
                  <dd>
                    <Link to={`/geschaefte/${beleg.deal.id}`}>
                      {beleg.deal.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h2>Positionen</h2>
            <TableWrap>
              <table className="list-table beleg-positionen">
                <thead>
                  <tr>
                    <th>Pos.</th>
                    <th>Bezeichnung</th>
                    <th className="numeric">Menge</th>
                    <th>Einheit</th>
                    {!lieferschein && <th className="numeric">Einzelpreis</th>}
                    {lieferschein && mitRest && (
                      <th className="numeric">Noch offen</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {beleg.positionen.map((position) => (
                    <tr key={position.id}>
                      <td data-label="Pos.">{position.position + 1}</td>
                      <td data-label="Bezeichnung">
                        {position.name}
                        {position.articleNumber !== null && (
                          <span className="field__hint">
                            {' '}
                            · Art.-Nr. {position.articleNumber}
                          </span>
                        )}
                      </td>
                      <td data-label="Menge" className="numeric">
                        {formatMenge(position.quantity)}
                      </td>
                      <td data-label="Einheit">{position.unit}</td>
                      {!lieferschein && (
                        <td data-label="Einzelpreis" className="numeric">
                          {formatMoney(position.unitPriceCents, beleg.currency)}
                        </td>
                      )}
                      {lieferschein && mitRest && (
                        <td data-label="Noch offen" className="numeric">
                          {formatMenge(position.restOffen ?? 0)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>

          {beleg.totals !== null && (
            <div className="card quote__totals">
              <h2>Summen</h2>
              <dl>
                <div>
                  <dt>Nettobetrag</dt>
                  <dd>{formatMoney(beleg.totals.netCents, beleg.currency)}</dd>
                </div>
                <div>
                  <dt>Umsatzsteuer</dt>
                  <dd>{formatMoney(beleg.totals.taxCents, beleg.currency)}</dd>
                </div>
                <div className="quote__gross">
                  <dt>Gesamtbetrag</dt>
                  <dd>
                    {formatMoney(beleg.totals.grossCents, beleg.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
        <aside className="doc-layout__preview">
          <PdfPreview
            path={`/begleitbelege/${beleg.id}/pdf`}
            version={`${beleg.id}-${beleg.status}`}
          />
        </aside>
      </div>
    </>
  );
};
