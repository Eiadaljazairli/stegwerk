import { useMutation, useQuery, gql, useApolloClient } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { verknuepft } from '../components/NichtSichtbar';
import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { DealBoard } from '../components/DealBoard';
import { IconDeals } from '../components/Icons';
import {
  DarstellungSchalter,
  DarstellungsFeldWahl,
  STANDARD_DATUM,
  STANDARD_GRUPPE,
  useDarstellung,
  useDarstellungsFelder,
} from '../components/Darstellung';
import { ListenBoard, ListenKalender } from '../components/KartenAnsicht';
import { geltendesFeld, wahlZumSpeichern } from '../lib/darstellung';
import { ObjectHeader } from '../components/ObjectHeader';
import { EmptyState } from '../components/EmptyState';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';

import { ColumnPicker } from '../components/ColumnPicker';
import { ExportButton } from '../components/ExportButton';
import { useCustomFieldColumns } from '../components/CustomFieldColumns';
import {
  asChoices,
  customFieldColumns,
  type ListColumn,
  ListTable,
  type NeueZeile,
} from '../components/ListTable';
import {
  personName,
  useVerantwortlichFilter,
  VerantwortlichFilter,
} from '../components/Verantwortlich';
import { Sammelleiste, useAuswahl } from '../components/Sammelleiste';
import { leseZahl } from '../lib/zahl';
import { useToast } from '../components/Toast';
import { usePapierkorb } from '../lib/usePapierkorb';
import { Schnellansicht } from '../components/Schnellansicht';
import { pickColumns } from '../lib/columns';
import { CustomFieldFilters } from '../components/CustomFieldFilters';
import {
  GruppenZeilen,
  GruppierenWahl,
  GruppierteListe,
  useGruppierung,
} from '../components/GruppierteListe';
import {
  mitGruppe,
  mitVorbelegung,
  vorbelegungAusFiltern,
} from '../lib/vorbelegung';
import { SavedViews } from '../components/SavedViews';
import { Pagination, SearchInput } from '../components/ListControls';
import {
  COMPANY_OPTIONS,
  CREATE_DEAL,
  DEALS,
  DELETE_DEAL,
  MOVE_DEAL_TO_STAGE,
  UPDATE_DEAL,
  WORKSPACE_SUMMARY,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';
import { useFeldrechte } from '../lib/useFeldrechte';
import {
  type Company,
  type CustomFieldFilter,
  type Deal,
  type DealStage,
  formatCurrency,
  type ListenGruppe,
  type ListenSumme,
  formatDate,
} from '../lib/types';
import { useListControls } from '../lib/useListControls';
import {
  PipelineWahl,
  type StageSetting,
  usePhasen,
  usePhasenJePipeline,
  usePipelines,
  usePipelineWahl,
  useStageBadge,
  waehlbarePhasen,
} from '../lib/stages';
import { zeilenFragment } from '../lib/neueZeilen';
import { useBezeichnung } from '../lib/useBezeichnung';
import { spalteBenennen } from '../lib/bezeichnung';
import { Werkzeugleiste } from '../components/Werkzeugleiste';

const NEUE_ZEILE = zeilenFragment(CREATE_DEAL, 'Deal');

const EMPTY_FORM = {
  name: '',
  amount: '',
  companyId: '',
  closeDate: '',
  pipelineId: '',
  stage: '',
};

const columnsFor = (
  moveStage: (id: string, stage: DealStage) => void,
  phasenVon: (pipelineId?: string | null) => StageSetting[],
  badge: (stage: DealStage, pipelineId?: string | null) => string,
): ListColumn<Deal>[] => [
  {
    key: 'name',
    label: 'Bezeichnung',
    sortField: 'name',
    render: (deal) => <Link to={`/geschaefte/${deal.id}`}>{deal.name}</Link>,
    edit: { feld: 'name', wert: (deal) => deal.name },
  },
  {
    key: 'company',
    label: 'Firma',
    render: (deal) =>
      verknuepft(deal.companyId, deal.company, 'Firma', () =>
        deal.company === null ? null : (
          <Link to={`/firmen/${deal.company.id}`}>{deal.company.name}</Link>
        ),
      ),
  },
  {
    key: 'amount',
    label: 'Betrag',
    sortField: 'amount',
    numeric: true,
    render: (deal) => formatCurrency(deal.amount, deal.currency),
    edit: { feld: 'amount', typ: 'number', wert: (deal) => deal.amount },
  },
  {
    key: 'stage',
    label: 'Phase',
    sortField: 'stage',
    render: (deal) => (
      <select
        className={badge(deal.stage, deal.pipelineId)}
        aria-label={`Phase von ${deal.name}`}
        value={deal.stage}
        onChange={(event) =>
          moveStage(deal.id, event.target.value as DealStage)
        }
      >
        {waehlbarePhasen(phasenVon(deal.pipelineId), deal.stage).map(
          (phase) => (
            <option key={phase.stage} value={phase.stage}>
              {phase.label}
            </option>
          ),
        )}
      </select>
    ),
  },
  {
    key: 'closeDate',
    label: 'Abschluss',
    sortField: 'closeDate',
    render: (deal) => formatDate(deal.closeDate),
    edit: { feld: 'closeDate', typ: 'date', wert: (deal) => deal.closeDate },
  },
  {
    key: 'owner',
    label: 'Verantwortlich',
    render: (row) => personName(row.owner),
  },
  {
    key: 'lostReason',
    label: 'Verlustgrund',
    render: (deal) => deal.lostReason ?? '—',
  },
];

const RUHEND_AB_TAGEN = 14;

const isoTag = (tag: Date): string =>
  `${String(tag.getFullYear())}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`;

const abschlussDiesenMonat = (heute = new Date()): CustomFieldFilter[] => [
  {
    key: 'std:closeDate',
    operator: 'GREATER_THAN',
    value: isoTag(new Date(heute.getFullYear(), heute.getMonth(), 0)),
  },
  {
    key: 'std:closeDate',
    operator: 'LESS_THAN',
    value: isoTag(new Date(heute.getFullYear(), heute.getMonth() + 1, 1)),
  },
];

type Schnellansicht = 'alle' | 'meine' | 'monat' | 'ruhend' | 'gewonnen';

const SCHNELLANSICHTEN: { key: Schnellansicht; label: string }[] = [
  { key: 'alle', label: 'Alle offenen' },
  { key: 'meine', label: 'Meine offenen' },
  { key: 'monat', label: 'Abschluss diesen Monat' },
  { key: 'ruhend', label: 'Ruhend' },
  { key: 'gewonnen', label: 'Gewonnen' },
];

type DealsData = {
  deals: {
    items: Deal[];
    totalCount: number;
    hasMore: boolean;
    summen: ListenSumme[];
    gruppen: ListenGruppe[];
  };
};

const SAMMEL_PHASE = gql`
  mutation SammelPhase($ids: [ID!]!, $stage: DealStage!) {
    sammelPhase(ids: $ids, stage: $stage)
  }
`;

const PhaseSetzen = ({
  ids,
  pipelineId,
}: {
  ids: string[];
  pipelineId: string | null;
}) => {
  const client = useApolloClient();
  const { zeige } = useToast();
  const phasen = usePhasen(pipelineId);
  const [setzen] = useMutation(SAMMEL_PHASE);

  return (
    <select
      aria-label="Phase setzen"
      value=""
      onChange={(event) => {
        const stage = event.target.value as DealStage;

        void setzen({ variables: { ids, stage } })
          .then(async (r) => {
            await client.refetchQueries({ include: 'active' });
            zeige({
              text: `${String(r.data?.sammelPhase ?? 0)} in „${phasen.find((phase) => phase.stage === stage)?.label ?? stage}“ verschoben.`,
            });
          })
          .catch(async (fehler: Error) => {
            zeige({ text: fehler.message });
            await client.refetchQueries({ include: 'active' });
          });
      }}
    >
      <option value="" disabled>
        Phase setzen…
      </option>
      {waehlbarePhasen(phasen).map((phase) => (
        <option key={phase.stage} value={phase.stage}>
          {phase.label}
        </option>
      ))}
    </select>
  );
};

export const DealsPage = () => {
  const bez = useBezeichnung();
  const toast = useToast();
  const [vorschau, setVorschau] = useState<string | null>(null);
  const pipelines = usePipelines();
  const [pipelineId, waehlePipeline] = usePipelineWahl(
    'stegwerk.deals.pipeline',
  );
  const phasen = usePhasen(pipelineId);
  const phasenVon = usePhasenJePipeline();
  const badge = useStageBadge();
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchParams] = useSearchParams();
  const [stageFilter, setStageFilter] = useState(() =>
    searchParams.has('ruhend') ? 'RUHEND' : '',
  );
  const [darstellung, setzeDarstellung] = useDarstellung('deals', {
    schluessel: 'stegwerk.deals.view',
  });
  const view =
    darstellung.art === 'liste' ? ('list' as const) : darstellung.art;
  const create = useCreate();
  const controls = useListControls('createdAt', 'DESC', 'deals');
  const verantwortlich = useVerantwortlichFilter('deals');
  const customColumns = useCustomFieldColumns('DEAL');

  const ohneAbschluss = controls.customFilters.filter(
    (filter) => filter.key !== 'std:closeDate',
  );
  const schnellansicht = (key: Schnellansicht) => {
    setStageFilter(
      key === 'ruhend' ? 'RUHEND' : key === 'gewonnen' ? 'WON' : 'OPEN',
    );
    verantwortlich.setWert(key === 'meine' ? 'me' : '');
    controls.setCustomFilters(
      key === 'monat'
        ? [...ohneAbschluss, ...abschlussDiesenMonat()]
        : ohneAbschluss,
    );
    controls.goToPage(0);
  };
  const abschlussFilter = controls.customFilters.filter(
    (filter) => filter.key === 'std:closeDate',
  );
  const aktiveSchnellansicht: Schnellansicht | null =
    stageFilter === 'RUHEND' && verantwortlich.wert === ''
      ? 'ruhend'
      : stageFilter === 'WON' && verantwortlich.wert === ''
        ? 'gewonnen'
        : stageFilter !== 'OPEN'
          ? null
          : abschlussFilter.length === 2 && verantwortlich.wert === ''
            ? 'monat'
            : abschlussFilter.length > 0
              ? null
              : verantwortlich.wert === 'me'
                ? 'meine'
                : verantwortlich.wert === ''
                  ? 'alle'
                  : null;

  const gruppierung = useGruppierung('DEAL', controls);
  const einePhase =
    stageFilter === '' || stageFilter === 'OPEN' || stageFilter === 'RUHEND'
      ? null
      : stageFilter;
  const listenVariablen = {
    ...controls.variables,
    stage: einePhase,
    openOnly: stageFilter === 'OPEN' ? true : null,
    ruhendTage: stageFilter === 'RUHEND' ? RUHEND_AB_TAGEN : null,
    ownerId: verantwortlich.ownerId,
    pipelineId,
    gruppierung: gruppierung.feld?.key ?? null,
  };
  const gruppiert = view === 'list' && gruppierung.feld !== undefined;

  const { data, loading, error } = useQuery<DealsData>(DEALS, {
    variables: gruppiert
      ? { ...listenVariablen, limit: 1, offset: 0 }
      : { ...listenVariablen, gruppierung: null },
    skip: pipelines.length > 0 && pipelineId === null,
  });
  const { data: companyData } = useQuery<{
    companies: { items: Pick<Company, 'id' | 'name'>[] };
  }>(COMPANY_OPTIONS);

  const refetchQueries = [DEALS, WORKSPACE_SUMMARY];
  const [createDeal, { loading: creating, error: createError }] = useMutation(
    CREATE_DEAL,
    { refetchQueries },
  );
  const [moveDealToStage] = useMutation(MOVE_DEAL_TO_STAGE, { refetchQueries });
  const loeschen = usePapierkorb('GESCHAEFT', DELETE_DEAL);

  const feldrechte = useFeldrechte();
  const frei = (spalte: string) => feldrechte.aenderbar('deal', spalte);
  const available = feldrechte.spalten('deal', [
    ...columnsFor(
      (id, stage) => {
        void moveDealToStage({ variables: { id, stage } }).catch(
          (fehler: Error) => toast.zeige({ text: fehler.message }),
        );
      },
      phasenVon,
      badge,
    ).map(spalteBenennen('company', bez('FIRMA'))),
    ...customFieldColumns<Deal>(customColumns),
  ]);
  const rechte = usePermissions();
  const [updateDeal, { error: updateError }] = useMutation(UPDATE_DEAL, {
    refetchQueries,
  });
  const darstellungsFelder = useDarstellungsFelder('DEAL');
  const boardKey = geltendesFeld(
    darstellung.gruppenFeld,
    STANDARD_GRUPPE.DEAL,
    darstellungsFelder.boardFelder,
  );
  const boardFeld = darstellungsFelder.boardFelder.find(
    (feld) => feld.key === boardKey,
  );
  const datumKey = geltendesFeld(
    darstellung.datumFeld,
    STANDARD_DATUM.DEAL,
    darstellungsFelder.datumFelder,
  );
  const datumFeld = darstellungsFelder.datumFelder.find(
    (feld) => feld.key === datumKey,
  );
  const kartenGemeinsam = {
    kennung: 'geschaefte',
    query: DEALS,
    variablen: {
      ...listenVariablen,
      stage: null,
      openOnly: null,
      ruhendTage: null,
    },
    seite: (daten: DealsData) => daten.deals,
    titel: (deal: Deal) => deal.name,
    link: (deal: Deal) => `/geschaefte/${deal.id}`,
    inhalt: (deal: Deal) => (
      <div className="board__card-foot">
        <span className="board__card-amount">
          {feldrechte.standard('deal', 'amount') === 'verborgen'
            ? ''
            : formatCurrency(deal.amount, deal.currency)}
        </span>
        <span className="board__card-date">{deal.company?.name ?? ''}</span>
      </div>
    ),
    speichern: (deal: Deal, aenderung: Record<string, unknown>) =>
      updateDeal({ variables: { input: { id: deal.id, ...aenderung } } }),
    mehrzahl: 'Geschäfte',
    skip: pipelines.length > 0 && pipelineId === null,
  };
  const summen = data?.deals.summen ?? [];
  const shown = pickColumns(available, controls.columns).map((column) =>
    column.key === 'amount' && summen.length > 0
      ? {
          ...column,
          summe: (
            <>
              {summen.map((zeile, index) => (
                <span key={zeile.gruppe ?? index} className="list-table__summe">
                  {formatCurrency(zeile.summe, zeile.gruppe ?? 'EUR')}
                </span>
              ))}
            </>
          ),
        }
      : column,
  );

  const companies = companyData?.companies.items ?? [];

  useEffect(() => {
    if (!create.open) {
      return;
    }

    setForm((alt) =>
      mitVorbelegung(alt, {
        ...vorbelegungAusFiltern(
          controls.customFilters,
          controls.verknuepfung,
          ['name', 'closeDate'],
          { frei },
        ),
        ...(einePhase === null ? {} : { stage: einePhase }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.open]);

  const [neuAnlegen] = useMutation<{ createDeal: Deal }>(CREATE_DEAL, {
    refetchQueries,
    awaitRefetchQueries: true,
  });
  const imFormular = (name: string, stage?: string) => {
    setForm({ ...EMPTY_FORM, name, stage: stage ?? '' });
    create.setOpen(true);
  };
  const neueZeile = (gruppe?: ListenGruppe): NeueZeile<Deal> | undefined =>
    rechte.can('deal:write')
      ? {
          label: bez('GESCHAEFT', 'neu'),
          fragment: NEUE_ZEILE,
          platzhalter: 'Bezeichnung des Geschäfts',
          anlegen: async (name) => {
            const input = mitGruppe(
              {
                ...vorbelegungAusFiltern(
                  controls.customFilters,
                  controls.verknuepfung,
                  ['closeDate'],
                  { nurIst: true, frei },
                ),
                ...(einePhase === null ? {} : { stage: einePhase }),
                ...(pipelineId === null ? {} : { pipelineId }),
                name,
              },
              gruppierung.feld?.key,
              gruppe,
              frei,
            );

            if (pipelines.length > 1 && pipelineId === null) {
              imFormular(name);
              throw new Error('Bitte im Formular die Pipeline wählen.');
            }

            try {
              const ergebnis = await neuAnlegen({ variables: { input } });
              const neu = ergebnis.data?.createDeal;

              if (neu === undefined) {
                throw new Error('Das Geschäft wurde nicht angelegt.');
              }

              return neu;
            } catch (fehler) {
              imFormular(
                name,
                typeof input.stage === 'string' ? input.stage : undefined,
              );
              throw new Error(
                `${fehler instanceof Error ? fehler.message : 'Nicht angelegt.'} Das Formular ist geöffnet.`,
              );
            }
          },
        }
      : undefined;

  const handleSubmit = async (): Promise<boolean> => {
    const parsedAmount = leseZahl(form.amount);

    if (parsedAmount === undefined) {
      toast.zeige({
        text: 'Der Betrag ist keine Zahl — etwa 1.500 oder 2500,50.',
      });

      return false;
    }

    const input = {
      name: form.name.trim(),
      ...(parsedAmount === null ? {} : { amount: parsedAmount }),
      ...(form.companyId === '' ? {} : { companyId: form.companyId }),
      ...(form.closeDate === '' ? {} : { closeDate: form.closeDate }),
      ...(form.stage === '' ? {} : { stage: form.stage }),
      ...(form.pipelineId !== ''
        ? { pipelineId: form.pipelineId }
        : pipelineId === null
          ? {}
          : { pipelineId }),
    };

    const result = await createDeal({ variables: { input } }).catch(() => null);

    if (result?.data === undefined || result.data === null) {
      return false;
    }

    setForm(EMPTY_FORM);

    return true;
  };

  const page = data?.deals;
  const auswahl = useAuswahl((page?.items ?? []).map((row) => row.id));

  const tabelle = (
    rows: Deal[],
    mitAuswahl: boolean,
    label?: string,
    gruppe?: ListenGruppe,
  ) => (
    <ListTable
      label={label}
      neueZeile={neueZeile(gruppe)}
      zuruecksetzenBei={listenVariablen}
      reihenfolge={mitAuswahl ? 'geschaeft' : undefined}
      auswahl={mitAuswahl ? auswahl : undefined}
      rowLabel={(deal) => deal.name}
      columns={
        mitAuswahl
          ? shown
          : shown.map((column) => ({ ...column, summe: undefined }))
      }
      onEdit={
        rechte.can('deal:write')
          ? (deal, feld, wert) =>
              updateDeal({
                variables: { input: { id: deal.id, [feld]: wert } },
              })
          : undefined
      }
      rows={rows}
      rowKey={(deal) => deal.id}
      controls={controls}
      rowActions={(deal) => (
        <>
          <button
            type="button"
            className="button button--ghost row-action"
            onClick={() => setVorschau(deal.id)}
          >
            Vorschau
          </button>
          <button
            type="button"
            className="button button--danger row-action"
            onClick={() => void loeschen(deal.id, deal.name)}
          >
            Löschen
          </button>
        </>
      )}
    />
  );

  return (
    <>
      <ObjectHeader
        hilfe="geschaefte"
        kind="deal"
        icon={IconDeals}
        label={bez('GESCHAEFT', 'mehrzahl')}
        anzahl={page?.totalCount ?? 0}
        actions={
          <>
            <DarstellungSchalter
              wert={darstellung.art}
              onChange={(art) => setzeDarstellung({ art })}
            />
            <PipelineWahl
              wert={pipelineId}
              onChange={(id) => {
                waehlePipeline(id);
                controls.goToPage(0);
              }}
            />
            <CreateButton create={create} label={bez('GESCHAEFT', 'neu')} />
          </>
        }
      />

      {createError !== undefined && (
        <div className="error-banner">{createError.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel={`${bez('GESCHAEFT')} anlegen`}
        submitting={creating}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="deal-name">Bezeichnung</label>
          <input
            id="deal-name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="deal-amount">Betrag (EUR)</label>
          <input
            id="deal-amount"
            type="text"
            inputMode="decimal"
            placeholder="z. B. 2.500,00"
            value={form.amount}
            onChange={(event) =>
              setForm({ ...form, amount: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="deal-company">{bez('FIRMA')}</label>
          <select
            id="deal-company"
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
        {pipelines.length > 1 && (
          <div className="field">
            <label htmlFor="deal-pipeline">Pipeline</label>
            <select
              id="deal-pipeline"
              value={
                form.pipelineId === '' ? (pipelineId ?? '') : form.pipelineId
              }
              onChange={(event) =>
                setForm({ ...form, pipelineId: event.target.value })
              }
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="deal-stage">Phase</label>
          <select
            id="deal-stage"
            value={form.stage}
            onChange={(event) =>
              setForm({ ...form, stage: event.target.value })
            }
          >
            <option value="">Erste Phase</option>
            {waehlbarePhasen(
              phasenVon(form.pipelineId === '' ? pipelineId : form.pipelineId),
            ).map((phase) => (
              <option key={phase.stage} value={phase.stage}>
                {phase.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="deal-close">Abschluss</label>
          <input
            id="deal-close"
            type="date"
            value={form.closeDate}
            onChange={(event) =>
              setForm({ ...form, closeDate: event.target.value })
            }
          />
        </div>
      </CreatePanel>

      {view === 'list' && (
        <div
          className="schnellansichten"
          role="group"
          aria-label="Schnellansichten"
        >
          {SCHNELLANSICHTEN.map((ansicht) => (
            <button
              key={ansicht.key}
              type="button"
              className={
                aktiveSchnellansicht === ansicht.key
                  ? 'schnellansichten__knopf is-active'
                  : 'schnellansichten__knopf'
              }
              aria-pressed={aktiveSchnellansicht === ansicht.key}
              onClick={() => schnellansicht(ansicht.key)}
            >
              {ansicht.label}
            </button>
          ))}
        </div>
      )}

      <Werkzeugleiste>
        <SearchInput
          value={controls.search}
          onChange={controls.setSearch}
          placeholder={`${bez('GESCHAEFT', 'mehrzahl')} durchsuchen…`}
        />
        {view !== 'board' && (
          <select
            className="toolbar__filter"
            aria-label="Nach Phase filtern"
            value={stageFilter}
            onChange={(event) => {
              setStageFilter(event.target.value);
              controls.goToPage(0);
            }}
          >
            <option value="">Alle Phasen</option>
            <option value="OPEN">Nur offene</option>
            <option value="RUHEND">
              Ruhend ({RUHEND_AB_TAGEN} Tage ohne Aktivität)
            </option>
            {waehlbarePhasen(phasen, stageFilter as DealStage).map((phase) => (
              <option key={phase.stage} value={phase.stage}>
                {phase.label}
              </option>
            ))}
          </select>
        )}

        <VerantwortlichFilter
          wert={verantwortlich.wert}
          onChange={(neu) => {
            verantwortlich.setWert(neu);
            controls.goToPage(0);
          }}
        />

        {view === 'list' && (
          <GruppierenWahl felder={gruppierung.felder} controls={controls} />
        )}
        {view === 'board' && (
          <DarstellungsFeldWahl
            art="board"
            felder={darstellungsFelder.boardFelder}
            wert={boardKey}
            standard={STANDARD_GRUPPE.DEAL}
            onChange={(gruppenFeld) => setzeDarstellung({ gruppenFeld })}
          />
        )}
        {view === 'kalender' && (
          <DarstellungsFeldWahl
            art="kalender"
            felder={darstellungsFelder.datumFelder}
            wert={datumKey}
            standard={STANDARD_DATUM.DEAL}
            onChange={(datumFeld) => setzeDarstellung({ datumFeld })}
          />
        )}

        <CustomFieldFilters entity="DEAL" controls={controls} />

        <div className="toolbar__ansicht">
          <SavedViews
            entity="DEAL"
            controls={controls}
            filters={{
              stage: stageFilter,
              verantwortlich: verantwortlich.wert,
              pipelineId: pipelineId ?? '',
            }}
            darstellung={{
              wahl: wahlZumSpeichern(darstellung, darstellungsFelder),
              setzen: setzeDarstellung,
            }}
            onApplyFilters={(next) => {
              setStageFilter(String(next.stage ?? ''));
              verantwortlich.setWert(String(next.verantwortlich ?? ''));

              if (
                typeof next.pipelineId === 'string' &&
                next.pipelineId !== ''
              ) {
                waehlePipeline(next.pipelineId);
              }
            }}
          />
          {view === 'list' && (
            <ExportButton
              entity="deal"
              controls={controls}
              variablen={listenVariablen}
            />
          )}
          {view === 'list' && (
            <ColumnPicker
              available={asChoices(available)}
              controls={controls}
            />
          )}
        </div>
      </Werkzeugleiste>

      {updateError !== undefined && (
        <div className="error-banner">{updateError.message}</div>
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {view === 'board' && boardKey !== null && boardKey !== 'std:stage' ? (
        boardFeld !== undefined && (
          <ListenBoard<Deal, DealsData>
            {...kartenGemeinsam}
            key={boardFeld.key}
            feld={boardFeld}
            darfAendern={
              rechte.can('deal:write') &&
              darstellungsFelder.aenderbar(boardFeld.key)
            }
          />
        )
      ) : view === 'kalender' ? (
        datumFeld !== undefined && (
          <ListenKalender<Deal, DealsData>
            {...kartenGemeinsam}
            variablen={listenVariablen}
            feld={datumFeld}
            darfAendern={
              rechte.can('deal:write') &&
              darstellungsFelder.aenderbar(datumFeld.key)
            }
          />
        )
      ) : view === 'board' ? (
        <DealBoard
          pipelineId={pipelineId}
          filter={{
            search: controls.variables.search,
            customFilters: controls.variables.customFilters,
            filterVerknuepfung: controls.variables.filterVerknuepfung,
            ownerId: verantwortlich.ownerId,
          }}
          onNeu={(stage) => {
            setForm((alt) => ({ ...alt, stage }));
            create.setOpen(true);
          }}
        />
      ) : (
        <>
          {loading && page === undefined ? (
            <>
              <LoadingAnnouncement />
              <SkeletonTable columns={6} />
            </>
          ) : page?.items.length === 0 ? (
            controls.search === '' && stageFilter === '' ? (
              <EmptyState
                title={bez('GESCHAEFT', 'keine')}
                description={bez.leer(
                  'GESCHAEFT',
                  'Ein Geschäft verfolgt eine Verkaufschance durch die Phasen. Legen Sie das erste an.',
                )}
                action={
                  <>
                    <button
                      type="button"
                      className="button"
                      onClick={() => create.setOpen(true)}
                    >
                      {bez('GESCHAEFT', 'ersten')} anlegen
                    </button>
                    <Link className="button button--ghost" to="/import">
                      Liste importieren
                    </Link>
                  </>
                }
              />
            ) : (
              <EmptyState
                title="Keine Treffer"
                description="Für diese Suche gibt es nichts. Ändern Sie den Suchbegriff oder setzen Sie den Filter zurück."
              />
            )
          ) : (
            <>
              <Sammelleiste
                art="GESCHAEFT"
                auswahl={auswahl}
                einzahl={bez('GESCHAEFT')}
                mehrzahl={bez('GESCHAEFT', 'mehrzahl')}
              >
                <PhaseSetzen
                  ids={[...auswahl.gewaehlt]}
                  pipelineId={pipelineId}
                />
              </Sammelleiste>
              {gruppierung.feld === undefined ? (
                <>
                  {tabelle(page?.items ?? [], true)}
                  <Pagination
                    controls={controls}
                    totalCount={page?.totalCount ?? 0}
                    hasMore={page?.hasMore ?? false}
                  />
                </>
              ) : (
                <GruppierteListe
                  key={gruppierung.feld.key}
                  liste="deals"
                  feld={gruppierung.feld}
                  gruppen={page?.gruppen ?? []}
                  name={(gruppe) =>
                    gruppierung.feld?.key === 'std:stage'
                      ? (phasen.find(
                          (phase) => phase.stage.toLowerCase() === gruppe.wert,
                        )?.label ?? null)
                      : null
                  }
                  reihenfolge={
                    gruppierung.feld.key === 'std:stage'
                      ? phasen.map((phase) => phase.stage.toLowerCase())
                      : undefined
                  }
                  summe={(gruppe) =>
                    gruppe.summen.map((zeile) => (
                      <span key={zeile.gruppe ?? 'eur'}>
                        {formatCurrency(zeile.summe, zeile.gruppe ?? 'EUR')}
                      </span>
                    ))
                  }
                  zeilen={(gruppe, titel) => (
                    <GruppenZeilen<DealsData, Deal>
                      query={DEALS}
                      variables={listenVariablen}
                      feld={(gruppierung.feld as { key: string }).key}
                      gruppe={gruppe}
                      seite={(daten) => daten.deals}
                    >
                      {(rows) => tabelle(rows, false, titel, gruppe)}
                    </GruppenZeilen>
                  )}
                />
              )}
            </>
          )}
        </>
      )}
      {vorschau !== null && (
        <Schnellansicht
          art="geschaeft"
          id={vorschau}
          onClose={() => setVorschau(null)}
        />
      )}
    </>
  );
};
