import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { IconCompanies } from '../components/Icons';
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
import {
  DublettenHinweis,
  ZusammenfuehrenAuswahl,
} from '../components/Dubletten';
import { usePapierkorb } from '../lib/usePapierkorb';
import { Schnellansicht } from '../components/Schnellansicht';
import { pickColumns } from '../lib/columns';
import { useFeldrechte } from '../lib/useFeldrechte';
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
import {
  DarstellungSchalter,
  DarstellungsFeldWahl,
  STANDARD_DATUM,
  STANDARD_GRUPPE,
  useDarstellung,
  useDarstellungsFelder,
} from '../components/Darstellung';
import {
  ListenBoard,
  ListenKalender,
  OhneFeld,
} from '../components/KartenAnsicht';
import { geltendesFeld, wahlZumSpeichern } from '../lib/darstellung';
import { Pagination, SearchInput } from '../components/ListControls';
import {
  COMPANIES,
  CREATE_COMPANY,
  DELETE_COMPANY,
  UPDATE_COMPANY,
} from '../lib/queries';
import {
  type Company,
  formatCurrency,
  type ListenGruppe,
  type ListenSumme,
} from '../lib/types';
import { usePermissions } from '../lib/usePermissions';
import { useListControls } from '../lib/useListControls';
import { zeilenFragment } from '../lib/neueZeilen';
import { useBezeichnung } from '../lib/useBezeichnung';
import { Werkzeugleiste } from '../components/Werkzeugleiste';

const NEUE_ZEILE = zeilenFragment(CREATE_COMPANY, 'Company');

const EMPTY_FORM = {
  name: '',
  domain: '',
  industry: '',
  street: '',
  postalCode: '',
  city: '',
};

const COLUMNS: ListColumn<Company>[] = [
  {
    key: 'name',
    label: 'Name',
    sortField: 'name',
    render: (company) => (
      <Link to={`/firmen/${company.id}`}>{company.name}</Link>
    ),
    edit: { feld: 'name', wert: (c) => c.name },
  },
  {
    key: 'domain',
    label: 'Domain',
    render: (c) => c.domain ?? '—',
    edit: { feld: 'domain', wert: (c) => c.domain },
  },
  {
    key: 'industry',
    label: 'Branche',
    sortField: 'industry',
    render: (c) => c.industry ?? '—',
    edit: { feld: 'industry', wert: (c) => c.industry },
  },
  {
    key: 'city',
    label: 'Stadt',
    sortField: 'city',
    render: (c) => c.city ?? '—',
    edit: { feld: 'city', wert: (c) => c.city },
  },
  {
    key: 'country',
    label: 'Land',
    sortField: 'country',
    render: (c) => c.country ?? '—',
    edit: { feld: 'country', wert: (c) => c.country },
  },
  {
    key: 'employeeCount',
    label: 'Mitarbeiter',
    sortField: 'employeeCount',
    numeric: true,
    render: (c) => c.employeeCount ?? '—',
    edit: {
      feld: 'employeeCount',
      typ: 'number',
      wert: (c) => c.employeeCount,
    },
  },
  {
    key: 'annualRevenue',
    label: 'Jahresumsatz',
    sortField: 'annualRevenue',
    numeric: true,
    render: (c) =>
      c.annualRevenue == null ? '—' : formatCurrency(c.annualRevenue, 'EUR'),
    edit: {
      feld: 'annualRevenue',
      typ: 'number',
      wert: (c) => c.annualRevenue ?? null,
    },
  },
  {
    key: 'owner',
    label: 'Verantwortlich',
    render: (row) => personName(row.owner),
  },
];

type CompaniesData = {
  companies: {
    items: Company[];
    totalCount: number;
    hasMore: boolean;
    summen: ListenSumme[];
    gruppen: ListenGruppe[];
  };
  companyIndustries: string[];
};

export const CompaniesPage = () => {
  const bez = useBezeichnung();
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [industry, setIndustry] = useState('');
  const create = useCreate();
  const controls = useListControls('name', 'ASC', 'companies');
  const verantwortlich = useVerantwortlichFilter('companies');
  const customColumns = useCustomFieldColumns('COMPANY');
  const feldrechte = useFeldrechte();
  const frei = (spalte: string) => feldrechte.aenderbar('company', spalte);
  const available = feldrechte.spalten('company', [
    ...COLUMNS,
    ...customFieldColumns<Company>(customColumns),
  ]);
  const rechte = usePermissions();

  const gruppierung = useGruppierung('COMPANY', controls);
  const [darstellung, setzeDarstellung] = useDarstellung('companies');
  const listenVariablen = {
    ...controls.variables,
    industry: industry === '' ? null : industry,
    ownerId: verantwortlich.ownerId,
    gruppierung: gruppierung.feld?.key ?? null,
  };

  const { data, loading, error } = useQuery<CompaniesData>(COMPANIES, {
    variables:
      gruppierung.feld === undefined || darstellung.art !== 'liste'
        ? { ...listenVariablen, gruppierung: null }
        : { ...listenVariablen, limit: 1, offset: 0 },
  });

  useEffect(() => {
    if (!create.open) {
      return;
    }

    setForm((alt) =>
      mitVorbelegung(alt, {
        ...vorbelegungAusFiltern(
          controls.customFilters,
          controls.verknuepfung,
          Object.keys(EMPTY_FORM),
          { frei },
        ),
        ...(industry === '' ? {} : { industry }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.open]);

  const refetchQueries = [COMPANIES];
  const [createCompany, { loading: creating, error: createError }] =
    useMutation(CREATE_COMPANY, { refetchQueries });
  const loeschen = usePapierkorb('FIRMA', DELETE_COMPANY);
  const [updateCompany, { error: updateError }] = useMutation(UPDATE_COMPANY, {
    refetchQueries,
  });
  const darstellungsFelder = useDarstellungsFelder(
    'COMPANY',
    data?.companyIndustries ?? [],
  );
  const boardKey = geltendesFeld(
    darstellung.gruppenFeld,
    STANDARD_GRUPPE.COMPANY,
    darstellungsFelder.boardFelder,
  );
  const boardFeld = darstellungsFelder.boardFelder.find(
    (feld) => feld.key === boardKey,
  );
  const datumKey = geltendesFeld(
    darstellung.datumFeld,
    STANDARD_DATUM.COMPANY,
    darstellungsFelder.datumFelder,
  );
  const datumFeld = darstellungsFelder.datumFelder.find(
    (feld) => feld.key === datumKey,
  );
  const istListe = darstellung.art === 'liste';
  const kartenSpeichern = (
    company: Company,
    aenderung: Record<string, unknown>,
  ) =>
    updateCompany({ variables: { input: { id: company.id, ...aenderung } } });
  const kartenInhalt = (company: Company) => (
    <div className="board__card-feld">
      <span>
        {[company.city, personName(company.owner)]
          .filter((teil) => teil !== null && teil !== '' && teil !== '—')
          .join(' · ') || '—'}
      </span>
    </div>
  );
  const kartenGemeinsam = {
    kennung: 'firmen',
    query: COMPANIES,
    variablen: listenVariablen,
    seite: (daten: CompaniesData) => daten.companies,
    titel: (company: Company) => company.name,
    link: (company: Company) => `/firmen/${company.id}`,
    inhalt: kartenInhalt,
    speichern: kartenSpeichern,
    mehrzahl: 'Firmen',
  };
  const summe = data?.companies.summen[0]?.summe;
  const shown = pickColumns(available, controls.columns).map((column) =>
    column.key === 'annualRevenue' && summe !== undefined
      ? { ...column, summe: formatCurrency(summe, 'EUR') }
      : column,
  );

  const [neuAnlegen] = useMutation<{ createCompany: Company }>(CREATE_COMPANY, {
    refetchQueries,
    awaitRefetchQueries: true,
  });
  const neueZeile = (gruppe?: ListenGruppe): NeueZeile<Company> | undefined =>
    rechte.can('company:write')
      ? {
          label: bez('FIRMA', 'neu'),
          fragment: NEUE_ZEILE,
          platzhalter: 'Name der Firma',
          hinweis: (text) => <DublettenHinweis art="FIRMA" name={text} />,
          anlegen: async (name) => {
            const input = mitGruppe(
              {
                ...vorbelegungAusFiltern(
                  controls.customFilters,
                  controls.verknuepfung,
                  Object.keys(EMPTY_FORM).filter((spalte) => spalte !== 'name'),
                  { nurIst: true, frei },
                ),
                ...(industry === '' ? {} : { industry }),
                name,
              },
              gruppierung.feld?.key,
              gruppe,
              frei,
            );
            const ergebnis = await neuAnlegen({ variables: { input } });
            const neu = ergebnis.data?.createCompany;

            if (neu === undefined) {
              throw new Error('Die Firma wurde nicht angelegt.');
            }

            return neu;
          },
        }
      : undefined;

  const handleSubmit = async (): Promise<boolean> => {
    const input = {
      name: form.name.trim(),
      ...(form.domain.trim() === '' ? {} : { domain: form.domain.trim() }),
      ...(form.industry.trim() === ''
        ? {}
        : { industry: form.industry.trim() }),
      ...(form.street.trim() === '' ? {} : { street: form.street.trim() }),
      ...(form.postalCode.trim() === ''
        ? {}
        : { postalCode: form.postalCode.trim() }),
      ...(form.city.trim() === '' ? {} : { city: form.city.trim() }),
    };

    const result = await createCompany({ variables: { input } }).catch(
      () => null,
    );

    if (result?.data === undefined || result.data === null) {
      return false;
    }

    setForm(EMPTY_FORM);

    return true;
  };

  const page = data?.companies;
  const auswahl = useAuswahl((page?.items ?? []).map((row) => row.id));

  const tabelle = (
    rows: Company[],
    mitAuswahl: boolean,
    label?: string,
    gruppe?: ListenGruppe,
  ) => (
    <ListTable
      label={label}
      neueZeile={neueZeile(gruppe)}
      zuruecksetzenBei={listenVariablen}
      reihenfolge={mitAuswahl ? 'firma' : undefined}
      auswahl={mitAuswahl ? auswahl : undefined}
      rowLabel={(company) => company.name}
      columns={
        mitAuswahl
          ? shown
          : shown.map((column) => ({ ...column, summe: undefined }))
      }
      onEdit={
        rechte.can('company:write')
          ? (company, feld, wert) =>
              updateCompany({
                variables: { input: { id: company.id, [feld]: wert } },
              })
          : undefined
      }
      rows={rows}
      rowKey={(company) => company.id}
      controls={controls}
      rowActions={(company) => (
        <>
          <button
            type="button"
            className="button button--ghost row-action"
            onClick={() => setVorschau(company.id)}
          >
            Vorschau
          </button>
          <button
            type="button"
            className="button button--danger row-action"
            onClick={() => void loeschen(company.id, company.name)}
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
        hilfe="firmen-kontakte"
        kind="company"
        icon={IconCompanies}
        label={bez('FIRMA', 'mehrzahl')}
        anzahl={page?.totalCount ?? 0}
        actions={
          <>
            <DarstellungSchalter
              wert={darstellung.art}
              onChange={(art) => setzeDarstellung({ art })}
            />
            <CreateButton create={create} label={bez('FIRMA', 'neu')} />
          </>
        }
      />

      {createError !== undefined && (
        <div className="error-banner">{createError.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel={`${bez('FIRMA')} anlegen`}
        submitting={creating}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="company-name">Name</label>
          <input
            id="company-name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="company-domain">Domain</label>
          <input
            id="company-domain"
            placeholder="beispiel.de"
            value={form.domain}
            onChange={(event) =>
              setForm({ ...form, domain: event.target.value })
            }
          />
        </div>
        <DublettenHinweis art="FIRMA" name={form.name} domain={form.domain} />
        <div className="field">
          <label htmlFor="company-industry">Branche</label>
          <input
            id="company-industry"
            value={form.industry}
            onChange={(event) =>
              setForm({ ...form, industry: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="company-street">Straße</label>
          <input
            id="company-street"
            value={form.street}
            onChange={(event) =>
              setForm({ ...form, street: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="company-postal-code">PLZ</label>
          <input
            id="company-postal-code"
            value={form.postalCode}
            onChange={(event) =>
              setForm({ ...form, postalCode: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="company-city">Stadt</label>
          <input
            id="company-city"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
        </div>
      </CreatePanel>

      <Werkzeugleiste>
        <SearchInput
          value={controls.search}
          onChange={controls.setSearch}
          placeholder={`${bez('FIRMA', 'mehrzahl')} durchsuchen…`}
        />
        <select
          className="toolbar__filter"
          aria-label="Nach Branche filtern"
          value={industry}
          onChange={(event) => {
            setIndustry(event.target.value);
            controls.goToPage(0);
          }}
        >
          <option value="">Alle Branchen</option>
          {data?.companyIndustries.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <VerantwortlichFilter
          wert={verantwortlich.wert}
          onChange={(neu) => {
            verantwortlich.setWert(neu);
            controls.goToPage(0);
          }}
        />

        {istListe && (
          <GruppierenWahl felder={gruppierung.felder} controls={controls} />
        )}
        {darstellung.art === 'board' && (
          <DarstellungsFeldWahl
            art="board"
            felder={darstellungsFelder.boardFelder}
            wert={boardKey}
            standard={STANDARD_GRUPPE.COMPANY}
            onChange={(gruppenFeld) => setzeDarstellung({ gruppenFeld })}
          />
        )}
        {darstellung.art === 'kalender' && (
          <DarstellungsFeldWahl
            art="kalender"
            felder={darstellungsFelder.datumFelder}
            wert={datumKey}
            standard={STANDARD_DATUM.COMPANY}
            onChange={(datumFeld) => setzeDarstellung({ datumFeld })}
          />
        )}

        <CustomFieldFilters entity="COMPANY" controls={controls} />

        <div className="toolbar__ansicht">
          <SavedViews
            entity="COMPANY"
            controls={controls}
            filters={{ industry, verantwortlich: verantwortlich.wert }}
            onApplyFilters={(next) => {
              setIndustry(String(next.industry ?? ''));
              verantwortlich.setWert(String(next.verantwortlich ?? ''));
            }}
            darstellung={{
              wahl: wahlZumSpeichern(darstellung, darstellungsFelder),
              setzen: setzeDarstellung,
            }}
          />
          {istListe && (
            <ExportButton
              entity="company"
              controls={controls}
              variablen={listenVariablen}
            />
          )}
          {istListe && (
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

      {darstellung.art === 'board' ? (
        boardFeld === undefined ? (
          darstellungsFelder.geladen && <OhneFeld art="board" />
        ) : (
          <ListenBoard<Company, CompaniesData>
            {...kartenGemeinsam}
            key={boardFeld.key}
            feld={boardFeld}
            darfAendern={
              rechte.can('company:write') &&
              darstellungsFelder.aenderbar(boardFeld.key)
            }
          />
        )
      ) : darstellung.art === 'kalender' ? (
        datumFeld === undefined ? (
          darstellungsFelder.geladen && <OhneFeld art="kalender" />
        ) : (
          <ListenKalender<Company, CompaniesData>
            {...kartenGemeinsam}
            feld={datumFeld}
            darfAendern={
              rechte.can('company:write') &&
              darstellungsFelder.aenderbar(datumFeld.key)
            }
          />
        )
      ) : loading && page === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={5} />
        </>
      ) : page?.items.length === 0 ? (
        controls.search === '' && industry === '' ? (
          <EmptyState
            title={bez('FIRMA', 'keine')}
            description={bez.leer(
              'FIRMA',
              'Firmen sind der Anker: Kontakte und Geschäfte hängen an ihnen. Legen Sie die erste an oder importieren Sie eine Liste.',
              true,
            )}
            action={
              <>
                <button
                  type="button"
                  className="button"
                  onClick={() => create.setOpen(true)}
                >
                  {bez('FIRMA', 'ersten')} anlegen
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
            art="FIRMA"
            auswahl={auswahl}
            einzahl={bez('FIRMA')}
            mehrzahl={bez('FIRMA', 'mehrzahl')}
          >
            {rechte.can('company:write') && rechte.can('company:delete') && (
              <ZusammenfuehrenAuswahl
                art="FIRMA"
                zeilen={(page?.items ?? [])
                  .filter((company) => auswahl.gewaehlt.has(company.id))
                  .map((company) => ({
                    id: company.id,
                    name: company.name,
                    detail:
                      [company.domain, company.city]
                        .filter(Boolean)
                        .join(' · ') || null,
                  }))}
                onFertig={auswahl.leeren}
              />
            )}
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
              liste="companies"
              feld={gruppierung.feld}
              gruppen={page?.gruppen ?? []}
              summe={(gruppe) =>
                gruppe.summen.map((zeile) => (
                  <span key={zeile.gruppe ?? 'eur'}>
                    {formatCurrency(zeile.summe, 'EUR')}
                  </span>
                ))
              }
              zeilen={(gruppe, titel) => (
                <GruppenZeilen<CompaniesData, Company>
                  query={COMPANIES}
                  variables={listenVariablen}
                  feld={(gruppierung.feld as { key: string }).key}
                  gruppe={gruppe}
                  seite={(daten) => daten.companies}
                >
                  {(rows) => tabelle(rows, false, titel, gruppe)}
                </GruppenZeilen>
              )}
            />
          )}
        </>
      )}
      {vorschau !== null && (
        <Schnellansicht
          art="firma"
          id={vorschau}
          onClose={() => setVorschau(null)}
        />
      )}
    </>
  );
};
