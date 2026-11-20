import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { verknuepft } from '../components/NichtSichtbar';
import { AttachmentsSection } from '../components/AttachmentsSection';
import { AutomationKnoepfe } from '../components/AutomationKnoepfe';
import { KiVorschlagHinweis } from '../components/KiVorschlagHinweis';
import { BegleitbelegeKarte } from '../components/Begleitbelege';
import { CustomFieldsSection } from '../components/CustomFieldsSection';
import { ActivityRail } from '../components/ActivityRail';
import { Freigaben } from '../components/Freigaben';
import { FavoritStern } from '../components/Favoriten';
import { Highlights } from '../components/Highlights';
import { IconDeals, IconQuotes } from '../components/Icons';
import { MessageList } from '../components/MessageList';
import { NeueMail } from '../components/NeueMail';
import { StagePath } from '../components/StagePath';
import { useMerkeBesuch } from '../lib/zuletzt';
import { useQuoteFor } from '../lib/useQuoteFor';
import { VerantwortlichAuswahl } from '../components/Verantwortlich';
import { EditableField } from '../components/EditableField';
import { useFeldrechte } from '../lib/useFeldrechte';
import {
  CREATE_COMPANY,
  CREATE_CONTACT,
  DEAL_DETAIL,
  UPDATE_DEAL,
  VERLUSTGRUENDE,
  WORKSPACE_SUMMARY,
} from '../lib/queries';
import { type DealDetail, formatCurrency, formatDate } from '../lib/types';
import { usePipelines, useStageProbability } from '../lib/stages';
import { AkteFehlt } from '../components/AkteFehlt';
import {
  BeteiligteSection,
  kontaktAusText,
} from '../components/BeteiligteSection';
import { VerknuepfungFeld } from '../components/VerknuepfungFeld';
import { usePermissions } from '../lib/usePermissions';
import { useBezeichnung } from '../lib/useBezeichnung';

export const vorTagen = (iso: string, jetzt = new Date()): string => {
  const tage = Math.floor(
    (jetzt.getTime() - new Date(iso).getTime()) / 86_400_000,
  );

  if (tage <= 0) {
    return 'heute';
  }

  return tage === 1 ? 'gestern' : `vor ${String(tage)} Tagen`;
};

const Verlustgrund = ({
  wert,
  onSave,
}: {
  wert: string | null;
  onSave: (neu: string) => void;
}) => {
  const { data } = useQuery<{ verlustgruende: string[] }>(VERLUSTGRUENDE);
  const [text, setText] = useState(wert ?? '');

  useEffect(() => setText(wert ?? ''), [wert]);

  const speichern = () => {
    if (text.trim() !== (wert ?? '')) {
      onSave(text);
    }
  };

  return (
    <div className="detail-field">
      <label className="detail-field__label" htmlFor="verlustgrund">
        Verlustgrund
      </label>
      <div className="detail-field__value detail-field__value--static">
        <input
          id="verlustgrund"
          list="verlustgruende"
          maxLength={200}
          placeholder="Warum ist es verloren?"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={speichern}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <datalist id="verlustgruende">
          {(data?.verlustgruende ?? []).map((grund) => (
            <option key={grund} value={grund} />
          ))}
        </datalist>
      </div>
    </div>
  );
};

export const DealDetailPage = () => {
  const bez = useBezeichnung();
  const feldrechte = useFeldrechte();
  const { id = '' } = useParams();
  const quoteFor = useQuoteFor();
  const { data, loading, error, refetch } = useQuery<{ deal: DealDetail }>(
    DEAL_DETAIL,
    { variables: { id } },
  );
  const stageProbability = useStageProbability(data?.deal.pipelineId);
  const pipelines = usePipelines();
  const besuchtes = data?.deal;
  useMerkeBesuch(
    besuchtes === undefined || besuchtes === null
      ? null
      : ((x) => ({
          to: `/geschaefte/${x.id}`,
          title: x.name,
          art: bez('GESCHAEFT'),
        }))(besuchtes),
  );

  const [updateDeal, { error: updateError }] = useMutation(UPDATE_DEAL, {
    refetchQueries: [WORKSPACE_SUMMARY],
  });
  const [firmaAnlegen] = useMutation<{ createCompany: { id: string } }>(
    CREATE_COMPANY,
  );
  const [kontaktAnlegen] = useMutation<{ createContact: { id: string } }>(
    CREATE_CONTACT,
  );
  const { can } = usePermissions();

  if (loading) {
    return <div className="state">Wird geladen…</div>;
  }

  if (error !== undefined) {
    return (
      <AkteFehlt
        meldung={error.message}
        zurueck={{ to: '/geschaefte', label: 'Zu den Geschäften' }}
        live={{ objekt: 'deal', id }}
      />
    );
  }

  const deal = data?.deal;

  if (deal === undefined) {
    return <div className="state">Geschäft nicht gefunden.</div>;
  }

  const werteFuerVorlage = {
    vorname: deal.primaryContact?.firstName ?? null,
    nachname: deal.primaryContact?.lastName ?? null,
    firma: deal.company?.name ?? null,
  };

  const saveField =
    (field: string, isNumeric = false) =>
    (raw: string) => {
      const trimmed = raw.trim();
      let value: string | number | null = trimmed === '' ? null : trimmed;

      if (isNumeric && trimmed !== '') {
        const parsed = Number.parseFloat(trimmed);

        if (!Number.isFinite(parsed)) {
          return;
        }

        value = parsed;
      }

      return updateDeal({
        variables: { input: { id: deal.id, [field]: value } },
      });
    };

  const verknuepfen = async (felder: {
    companyId?: string | null;
    primaryContactId?: string | null;
  }) => {
    await updateDeal({ variables: { input: { id: deal.id, ...felder } } });
    await refetch();
  };

  const saveCustomField = (key: string, value: string) =>
    updateDeal({
      variables: {
        input: {
          id: deal.id,
          customFields: { [key]: value.trim() === '' ? null : value },
        },
      },
    });

  return (
    <>
      <Highlights
        live={{ objekt: 'deal', id: deal.id }}
        kind="deal"
        icon={IconDeals}
        label={bez('GESCHAEFT')}
        title={deal.name}
        blaettern={{ art: 'geschaeft', id: deal.id, basis: '/geschaefte' }}
        back={{ to: '/geschaefte', label: bez('GESCHAEFT', 'mehrzahl') }}
        fields={[
          ...(feldrechte.standard('deal', 'amount') === 'verborgen'
            ? []
            : [
                {
                  label: 'Betrag',
                  value: formatCurrency(deal.amount, deal.currency),
                  numeric: true,
                },
              ]),
          {
            label: 'Firma',
            value: verknuepft(deal.companyId, deal.company, 'Firma', () =>
              deal.company === null ? null : (
                <Link to={`/firmen/${deal.company.id}`}>
                  {deal.company.name}
                </Link>
              ),
            ),
          },
          {
            label: 'Ansprechpartner',
            value: verknuepft(
              deal.primaryContactId,
              deal.primaryContact,
              'Kontakt',
              () =>
                deal.primaryContact === null ? null : (
                  <Link to={`/kontakte/${deal.primaryContact.id}`}>
                    {deal.primaryContact.firstName}{' '}
                    {deal.primaryContact.lastName}
                  </Link>
                ),
            ),
          },
          {
            label: 'Abschluss',
            value: formatDate(deal.closeDate),
            numeric: true,
          },
          {
            label: 'Letzte Aktivität',
            value: vorTagen(deal.letzteAktivitaet),
          },
        ]}
        actions={
          <>
            <FavoritStern art="GESCHAEFT" datensatzId={deal.id} />
            <AutomationKnoepfe art="deal" zielId={deal.id} />
            <NeueMail
              ziel={{ dealId: deal.id }}
              an={
                deal.primaryContact?.email === undefined ||
                deal.primaryContact.email === null ||
                deal.primaryContact.email === ''
                  ? []
                  : [deal.primaryContact.email]
              }
              werte={werteFuerVorlage}
            />
            <button
              type="button"
              className="button button--ghost"
              onClick={() =>
                void quoteFor({
                  companyId: deal.company?.id,
                  dealId: deal.id,
                })
              }
            >
              <IconQuotes />
              Angebot erstellen
            </button>
          </>
        }
      />

      <StagePath
        dealId={deal.id}
        stage={deal.stage}
        pipelineId={deal.pipelineId}
      />

      {updateError !== undefined && (
        <div className="error-banner">{updateError.message}</div>
      )}

      <KiVorschlagHinweis art="deal" id={deal.id} />

      <div className="record-layout">
        <div className="record-layout__main">
          <div className="card detail-grid">
            <EditableField
              label="Bezeichnung"
              value={deal.name}
              onSave={saveField('name')}
            />
            <div className="detail-field">
              <label className="detail-field__label" htmlFor="verantwortlich">
                Verantwortlich
              </label>
              <div className="detail-field__value detail-field__value--static">
                <VerantwortlichAuswahl
                  id="verantwortlich"
                  owner={deal.owner}
                  onSave={(ownerId) =>
                    void updateDeal({
                      variables: { input: { id: deal.id, ownerId } },
                      update: (cache) => {
                        cache.evict({ fieldName: 'deals' });
                        cache.gc();
                      },
                    }).catch(() => null)
                  }
                />
              </div>
            </div>
            {pipelines.length > 1 && (
              <div className="detail-field">
                <label className="detail-field__label" htmlFor="pipeline">
                  Pipeline
                </label>
                <div className="detail-field__value detail-field__value--static">
                  <select
                    id="pipeline"
                    value={deal.pipelineId ?? pipelines[0].id}
                    onChange={(event) =>
                      void updateDeal({
                        variables: {
                          input: {
                            id: deal.id,
                            pipelineId: event.target.value,
                          },
                        },
                        update: (cache) => {
                          cache.evict({ fieldName: 'deals' });
                          cache.evict({ fieldName: 'pipelines' });
                          cache.gc();
                        },
                      }).catch(() => null)
                    }
                  >
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {feldrechte.standard('deal', 'amount') !== 'verborgen' && (
              <EditableField
                label="Betrag"
                value={deal.amount}
                type="number"
                format={(amount) =>
                  formatCurrency(Number(amount), deal.currency)
                }
                onSave={saveField('amount', true)}
                nurLesen={feldrechte.standard('deal', 'amount') === 'lesen'}
              />
            )}
            <EditableField
              label="Abschluss"
              value={deal.closeDate}
              type="date"
              format={(date) => formatDate(String(date))}
              onSave={saveField('closeDate')}
            />
            {feldrechte.standard('deal', 'probability') !== 'verborgen' && (
              <EditableField
                label="Wahrscheinlichkeit"
                value={deal.probability ?? null}
                type="number"
                format={(prozent) => `${String(prozent)} %`}
                placeholder={`${String(stageProbability(deal.stage))} % laut Phase`}
                onSave={saveField('probability', true)}
                nurLesen={
                  feldrechte.standard('deal', 'probability') === 'lesen'
                }
              />
            )}
            {(deal.stage === 'LOST' || deal.lostReason != null) && (
              <Verlustgrund
                wert={deal.lostReason ?? null}
                onSave={(neu) => void saveField('lostReason')(neu)}
              />
            )}
            <VerknuepfungFeld
              label={bez('FIRMA')}
              art="firma"
              belegt={deal.companyId != null}
              darfAendern={can('deal:write')}
              anzeige={verknuepft(
                deal.companyId,
                deal.company,
                'Firma',
                () =>
                  deal.company === null ? null : (
                    <Link to={`/firmen/${deal.company.id}`}>
                      {deal.company.name}
                    </Link>
                  ),
                <span className="detail-field__empty">—</span>,
              )}
              onWaehlen={async (firma) => {
                await verknuepfen({ companyId: firma.id });
              }}
              onNeu={async (name) => {
                const { data: neu } = await firmaAnlegen({
                  variables: { input: { name } },
                });

                if (neu != null) {
                  await verknuepfen({ companyId: neu.createCompany.id });
                }
              }}
              onEntfernen={() => verknuepfen({ companyId: null })}
            />
            <VerknuepfungFeld
              label="Hauptkontakt"
              art="kontakt"
              belegt={deal.primaryContactId != null}
              darfAendern={can('deal:write')}
              anzeige={verknuepft(
                deal.primaryContactId,
                deal.primaryContact,
                'Kontakt',
                () =>
                  deal.primaryContact === null ? null : (
                    <Link to={`/kontakte/${deal.primaryContact.id}`}>
                      {deal.primaryContact.firstName}{' '}
                      {deal.primaryContact.lastName}
                    </Link>
                  ),
                <span className="detail-field__empty">—</span>,
              )}
              onWaehlen={async (kontakt) => {
                await verknuepfen({ primaryContactId: kontakt.id });
              }}
              onNeu={async (text) => {
                const { data: neu } = await kontaktAnlegen({
                  variables: {
                    input: {
                      ...kontaktAusText(text),
                      ...(deal.companyId == null
                        ? {}
                        : { companyId: deal.companyId }),
                    },
                  },
                });

                if (neu != null) {
                  await verknuepfen({ primaryContactId: neu.createContact.id });
                }
              }}
              onEntfernen={() => verknuepfen({ primaryContactId: null })}
            />
          </div>

          <BeteiligteSection
            deal={deal}
            darfAendern={can('deal:write')}
            onChanged={() => void refetch()}
          />

          <CustomFieldsSection
            entity="DEAL"
            datensatzId={deal.id}
            values={deal.customFields}
            onSave={saveCustomField}
          />

          <BegleitbelegeKarte filter={{ dealId: deal.id }} />

          <AttachmentsSection ziel={{ dealId: deal.id }} />

          <Freigaben art="deal" datensatzId={deal.id} />

          <MessageList
            ziel={{ kind: 'deal', dealId: deal.id }}
            werte={werteFuerVorlage}
          />
        </div>

        <ActivityRail
          recordId={deal.id}
          target={{ dealId: deal.id }}
          notizVorschlaege={[
            ...(deal.company == null
              ? []
              : [
                  {
                    spalte: 'companyId' as const,
                    id: deal.company.id,
                    label: deal.company.name,
                  },
                ]),
            ...(deal.primaryContact == null
              ? []
              : [
                  {
                    spalte: 'contactId' as const,
                    id: deal.primaryContact.id,
                    label:
                      `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim(),
                  },
                ]),
          ]}
          appointments={deal.appointments}
          beteiligtenTermine={deal.beteiligtenTermine}
          tasks={deal.tasks}
          notes={deal.notes}
          onChanged={() => void refetch()}
        />
      </div>
    </>
  );
};
