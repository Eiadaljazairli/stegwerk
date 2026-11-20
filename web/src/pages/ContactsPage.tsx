import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { verknuepft } from '../components/NichtSichtbar';
import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { IconContacts } from '../components/Icons';
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
import { AUSWAHL_SCHLUESSEL } from './SerienmailsPage';
import { ZuVerteilerHinzufuegen } from '../components/ZuVerteilerHinzufuegen';
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
import { kontaktAusText } from '../components/BeteiligteSection';
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
  COMPANY_OPTIONS,
  CONTACTS,
  CREATE_CONTACT,
  DELETE_CONTACT,
  UPDATE_CONTACT,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';
import { type Company, type Contact, type ListenGruppe } from '../lib/types';
import { useListControls } from '../lib/useListControls';
import { formatTelefon, telLink } from '../lib/telefon';
import { zeilenFragment } from '../lib/neueZeilen';
import { useBezeichnung } from '../lib/useBezeichnung';
import { spalteBenennen } from '../lib/bezeichnung';
import { Werkzeugleiste } from '../components/Werkzeugleiste';

const NEUE_ZEILE = zeilenFragment(CREATE_CONTACT, 'Contact');

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  companyId: '',
};

type ContactsData = {
  contacts: {
    items: Contact[];
    totalCount: number;
    hasMore: boolean;
    gruppen: ListenGruppe[];
  };
};

const COLUMNS: ListColumn<Contact>[] = [
  {
    key: 'name',
    label: 'Name',
    sortField: 'lastName',
    render: (contact) => (
      <Link to={`/kontakte/${contact.id}`}>
        {contact.firstName} {contact.lastName}
      </Link>
    ),
  },
  {
    key: 'email',
    label: 'E-Mail',
    sortField: 'email',
    render: (c) =>
      c.email === null ? (
        '—'
      ) : (
        <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>
          {c.email}
        </a>
      ),
    edit: { feld: 'email', typ: 'email', wert: (c) => c.email },
  },
  {
    key: 'jobTitle',
    label: 'Position',
    sortField: 'jobTitle',
    render: (c) => c.jobTitle ?? '—',
    edit: { feld: 'jobTitle', wert: (c) => c.jobTitle },
  },
  {
    key: 'company',
    label: 'Firma',
    render: (contact) =>
      verknuepft(contact.companyId, contact.company, 'Firma', () =>
        contact.company === null ? null : (
          <Link to={`/firmen/${contact.company.id}`}>
            {contact.company.name}
          </Link>
        ),
      ),
  },
  {
    key: 'phone',
    label: 'Telefon',
    render: (c) =>
      c.phone === null || c.phone === '' ? (
        formatTelefon(c.phone)
      ) : (
        <a href={telLink(c.phone)} onClick={(e) => e.stopPropagation()}>
          {formatTelefon(c.phone)}
        </a>
      ),
    edit: { feld: 'phone', wert: (c) => c.phone },
  },
  {
    key: 'owner',
    label: 'Verantwortlich',
    render: (row) => personName(row.owner),
  },
];

export const ContactsPage = () => {
  const bez = useBezeichnung();
  const navigate = useNavigate();
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [companyFilter, setCompanyFilter] = useState('');
  const create = useCreate();
  const controls = useListControls('lastName', 'ASC', 'contacts');
  const verantwortlich = useVerantwortlichFilter('contacts');
  const customColumns = useCustomFieldColumns('CONTACT');
  const feldrechte = useFeldrechte();
  const frei = (spalte: string) => feldrechte.aenderbar('contact', spalte);
  const available = feldrechte.spalten('contact', [
    ...COLUMNS.map(spalteBenennen('company', bez('FIRMA'))),
    ...customFieldColumns<Contact>(customColumns),
  ]);
  const shown = pickColumns(available, controls.columns);

  const gruppierung = useGruppierung('CONTACT', controls);
  const [darstellung, setzeDarstellung] = useDarstellung('contacts');
  const listenVariablen = {
    ...controls.variables,
    companyId: companyFilter === '' ? null : companyFilter,
    ownerId: verantwortlich.ownerId,
    gruppierung: gruppierung.feld?.key ?? null,
  };

  const { data, loading, error } = useQuery<ContactsData>(CONTACTS, {
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
        ...(companyFilter === '' ? {} : { companyId: companyFilter }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.open]);
  const { data: companyData } = useQuery<{
    companies: { items: Pick<Company, 'id' | 'name'>[] };
  }>(COMPANY_OPTIONS);

  const refetchQueries = [CONTACTS];
  const [createContact, { loading: creating, error: createError }] =
    useMutation(CREATE_CONTACT, { refetchQueries });
  const loeschen = usePapierkorb('KONTAKT', DELETE_CONTACT);
  const rechte = usePermissions();
  const [updateContact, { error: updateError }] = useMutation(UPDATE_CONTACT);

  const companies = companyData?.companies.items ?? [];

  const darstellungsFelder = useDarstellungsFelder('CONTACT');
  const boardKey = geltendesFeld(
    darstellung.gruppenFeld,
    STANDARD_GRUPPE.CONTACT,
    darstellungsFelder.boardFelder,
  );
  const boardFeld = darstellungsFelder.boardFelder.find(
    (feld) => feld.key === boardKey,
  );
  const datumKey = geltendesFeld(
    darstellung.datumFeld,
    STANDARD_DATUM.CONTACT,
    darstellungsFelder.datumFelder,
  );
  const datumFeld = darstellungsFelder.datumFelder.find(
    (feld) => feld.key === datumKey,
  );
  const istListe = darstellung.art === 'liste';
  const kartenGemeinsam = {
    kennung: 'kontakte',
    query: CONTACTS,
    variablen: listenVariablen,
    seite: (daten: ContactsData) => daten.contacts,
    titel: (contact: Contact) =>
      `${contact.firstName} ${contact.lastName}`.trim(),
    link: (contact: Contact) => `/kontakte/${contact.id}`,
    inhalt: (contact: Contact) => (
      <div className="board__card-feld">
        <span>
          {[contact.company?.name ?? null, contact.jobTitle]
            .filter((teil) => teil !== null && teil !== '')
            .join(' · ') || '—'}
        </span>
      </div>
    ),
    speichern: (contact: Contact, aenderung: Record<string, unknown>) =>
      updateContact({
        variables: { input: { id: contact.id, ...aenderung } },
        refetchQueries: [CONTACTS],
      }),
    mehrzahl: 'Kontakte',
  };

  const [neuAnlegen] = useMutation<{ createContact: Contact }>(CREATE_CONTACT, {
    refetchQueries,
    awaitRefetchQueries: true,
  });
  const neueZeile = (gruppe?: ListenGruppe): NeueZeile<Contact> | undefined =>
    rechte.can('contact:write')
      ? {
          label: bez('KONTAKT', 'neu'),
          fragment: NEUE_ZEILE,
          platzhalter: 'Vor- und Nachname',
          hinweis: (text) => {
            const teile = text.trim().split(/\s+/u);

            return teile.length < 2 ? null : (
              <DublettenHinweis
                art="KONTAKT"
                vorname={teile.slice(0, -1).join(' ')}
                nachname={teile[teile.length - 1]}
              />
            );
          },
          anlegen: async (text) => {
            const input = mitGruppe(
              {
                ...vorbelegungAusFiltern(
                  controls.customFilters,
                  controls.verknuepfung,
                  Object.keys(EMPTY_FORM).filter(
                    (spalte) => spalte !== 'firstName' && spalte !== 'lastName',
                  ),
                  { nurIst: true, frei },
                ),
                ...(companyFilter === '' ? {} : { companyId: companyFilter }),
                ...kontaktAusText(text),
              },
              gruppierung.feld?.key,
              gruppe,
              frei,
            );
            const ergebnis = await neuAnlegen({ variables: { input } });
            const neu = ergebnis.data?.createContact;

            if (neu === undefined) {
              throw new Error('Der Kontakt wurde nicht angelegt.');
            }

            return neu;
          },
        }
      : undefined;

  const handleSubmit = async (): Promise<boolean> => {
    const input = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(form.email.trim() === '' ? {} : { email: form.email.trim() }),
      ...(form.jobTitle.trim() === ''
        ? {}
        : { jobTitle: form.jobTitle.trim() }),
      ...(form.companyId === '' ? {} : { companyId: form.companyId }),
    };

    const result = await createContact({ variables: { input } }).catch(
      () => null,
    );

    if (result?.data === undefined || result.data === null) {
      return false;
    }

    setForm(EMPTY_FORM);

    return true;
  };

  const page = data?.contacts;
  const auswahl = useAuswahl((page?.items ?? []).map((row) => row.id));

  const tabelle = (
    rows: Contact[],
    mitAuswahl: boolean,
    label?: string,
    gruppe?: ListenGruppe,
  ) => (
    <ListTable
      label={label}
      neueZeile={neueZeile(gruppe)}
      zuruecksetzenBei={listenVariablen}
      reihenfolge={mitAuswahl ? 'kontakt' : undefined}
      auswahl={mitAuswahl ? auswahl : undefined}
      rowLabel={(contact) => `${contact.firstName} ${contact.lastName}`}
      columns={shown}
      onEdit={
        rechte.can('contact:write')
          ? (contact, feld, wert) =>
              updateContact({
                variables: { input: { id: contact.id, [feld]: wert } },
              })
          : undefined
      }
      rows={rows}
      rowKey={(contact) => contact.id}
      controls={controls}
      rowActions={(contact) => (
        <>
          <button
            type="button"
            className="button button--ghost row-action"
            onClick={() => setVorschau(contact.id)}
          >
            Vorschau
          </button>
          <button
            type="button"
            className="button button--danger row-action"
            onClick={() =>
              void loeschen(
                contact.id,
                `${contact.firstName} ${contact.lastName}`,
              )
            }
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
        kind="contact"
        icon={IconContacts}
        label={bez('KONTAKT', 'mehrzahl')}
        anzahl={page?.totalCount ?? 0}
        actions={
          <>
            <DarstellungSchalter
              wert={darstellung.art}
              onChange={(art) => setzeDarstellung({ art })}
            />
            <CreateButton create={create} label={bez('KONTAKT', 'neu')} />
          </>
        }
      />

      {createError !== undefined && (
        <div className="error-banner">{createError.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel={`${bez('KONTAKT')} anlegen`}
        submitting={creating}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="contact-first">Vorname</label>
          <input
            id="contact-first"
            required
            value={form.firstName}
            onChange={(event) =>
              setForm({ ...form, firstName: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="contact-last">Nachname</label>
          <input
            id="contact-last"
            required
            value={form.lastName}
            onChange={(event) =>
              setForm({ ...form, lastName: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="contact-email">E-Mail</label>
          <input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
        </div>
        <DublettenHinweis
          art="KONTAKT"
          vorname={form.firstName}
          nachname={form.lastName}
          email={form.email}
        />
        <div className="field">
          <label htmlFor="contact-role">Position</label>
          <input
            id="contact-role"
            value={form.jobTitle}
            onChange={(event) =>
              setForm({ ...form, jobTitle: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="contact-company">{bez('FIRMA')}</label>
          <select
            id="contact-company"
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
      </CreatePanel>

      <Werkzeugleiste>
        <SearchInput
          value={controls.search}
          onChange={controls.setSearch}
          placeholder={`${bez('KONTAKT', 'mehrzahl')} durchsuchen…`}
        />
        <select
          className="toolbar__filter"
          aria-label={`Nach ${bez('FIRMA')} filtern`}
          value={companyFilter}
          onChange={(event) => {
            setCompanyFilter(event.target.value);
            controls.goToPage(0);
          }}
        >
          <option value="">Alle {bez('FIRMA', 'mehrzahl')}</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
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
            standard={STANDARD_GRUPPE.CONTACT}
            onChange={(gruppenFeld) => setzeDarstellung({ gruppenFeld })}
          />
        )}
        {darstellung.art === 'kalender' && (
          <DarstellungsFeldWahl
            art="kalender"
            felder={darstellungsFelder.datumFelder}
            wert={datumKey}
            standard={STANDARD_DATUM.CONTACT}
            onChange={(datumFeld) => setzeDarstellung({ datumFeld })}
          />
        )}

        <CustomFieldFilters entity="CONTACT" controls={controls} />

        <div className="toolbar__ansicht">
          <SavedViews
            entity="CONTACT"
            controls={controls}
            filters={{
              companyId: companyFilter,
              verantwortlich: verantwortlich.wert,
            }}
            onApplyFilters={(next) => {
              setCompanyFilter(String(next.companyId ?? ''));
              verantwortlich.setWert(String(next.verantwortlich ?? ''));
            }}
            darstellung={{
              wahl: wahlZumSpeichern(darstellung, darstellungsFelder),
              setzen: setzeDarstellung,
            }}
          />
          {istListe && (
            <ExportButton
              entity="contact"
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
          <ListenBoard<Contact, ContactsData>
            {...kartenGemeinsam}
            key={boardFeld.key}
            feld={boardFeld}
            darfAendern={
              rechte.can('contact:write') &&
              darstellungsFelder.aenderbar(boardFeld.key)
            }
          />
        )
      ) : darstellung.art === 'kalender' ? (
        datumFeld === undefined ? (
          darstellungsFelder.geladen && <OhneFeld art="kalender" />
        ) : (
          <ListenKalender<Contact, ContactsData>
            {...kartenGemeinsam}
            feld={datumFeld}
            darfAendern={
              rechte.can('contact:write') &&
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
        controls.search === '' && companyFilter === '' ? (
          <EmptyState
            title={bez('KONTAKT', 'keine')}
            description={bez.leer(
              'KONTAKT',
              'Kontakte sind die Menschen hinter den Firmen. Legen Sie den ersten an oder importieren Sie eine Liste.',
              true,
            )}
            action={
              <>
                <button
                  type="button"
                  className="button"
                  onClick={() => create.setOpen(true)}
                >
                  {bez('KONTAKT', 'ersten')} anlegen
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
            art="KONTAKT"
            auswahl={auswahl}
            einzahl={bez('KONTAKT')}
            mehrzahl={bez('KONTAKT', 'mehrzahl')}
          >
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                try {
                  window.sessionStorage.setItem(
                    AUSWAHL_SCHLUESSEL,
                    JSON.stringify([...auswahl.gewaehlt]),
                  );
                } catch {}
                navigate('/serienmails');
              }}
            >
              Serienmail
            </button>
            {rechte.can('contact:write') && (
              <ZuVerteilerHinzufuegen
                kontaktIds={[...auswahl.gewaehlt]}
                onFertig={auswahl.leeren}
              />
            )}
            {rechte.can('contact:write') && rechte.can('contact:delete') && (
              <ZusammenfuehrenAuswahl
                art="KONTAKT"
                zeilen={(page?.items ?? [])
                  .filter((contact) => auswahl.gewaehlt.has(contact.id))
                  .map((contact) => ({
                    id: contact.id,
                    name: `${contact.firstName} ${contact.lastName}`.trim(),
                    detail:
                      [contact.email, contact.company?.name]
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
              liste="contacts"
              feld={gruppierung.feld}
              gruppen={page?.gruppen ?? []}
              zeilen={(gruppe, titel) => (
                <GruppenZeilen<ContactsData, Contact>
                  query={CONTACTS}
                  variables={listenVariablen}
                  feld={(gruppierung.feld as { key: string }).key}
                  gruppe={gruppe}
                  seite={(daten) => daten.contacts}
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
          art="kontakt"
          id={vorschau}
          onClose={() => setVorschau(null)}
        />
      )}
    </>
  );
};
