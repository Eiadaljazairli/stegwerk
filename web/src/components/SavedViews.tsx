import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';

import {
  bereinigeStand,
  darstellungDesStands,
  gleicherStand,
  type ListenStand,
  PARAMETER,
  standKodieren,
  standLesen,
} from '../lib/ansichtLink';
import { useAuth } from '../lib/auth';
import { type DarstellungsWahl } from '../lib/darstellung';
import {
  CREATE_SAVED_VIEW,
  CUSTOM_FIELDS,
  DELETE_SAVED_VIEW,
  MY_ROLE,
  SAVED_VIEWS,
  SET_DEFAULT_SAVED_VIEW,
  UPDATE_SAVED_VIEW,
} from '../lib/queries';
import { type CustomField, type SavedView } from '../lib/types';
import {
  feldrechtDesFilters,
  STANDARD_FILTER_FELDER,
} from '../lib/standardFelder';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import { type ListControls } from '../lib/useListControls';
import { useToast } from './Toast';
import { IconClose, IconLock, IconStar } from './Icons';

type SavedViewsProps = {
  entity: CustomField['entity'];
  controls: ListControls;
  filters: Record<string, string | number | boolean | null>;
  onApplyFilters: (
    filters: Record<string, string | number | boolean | null>,
  ) => void;
  darstellung?: {
    wahl: DarstellungsWahl;
    setzen: (teil: Partial<DarstellungsWahl>) => void;
  };
};

const ART_LABEL: Record<string, string> = {
  board: 'Board',
  kalender: 'Kalender',
};

export const SavedViews = ({
  entity,
  controls,
  filters,
  onApplyFilters,
  darstellung,
}: SavedViewsProps) => {
  const { session } = useAuth();
  const { data } = useQuery<{ savedViews: SavedView[] }>(SAVED_VIEWS, {
    variables: { entity },
  });
  const { data: roleData } = useQuery<{ myRole: string }>(MY_ROLE);
  const isAdmin = roleData?.myRole === 'OWNER' || roleData?.myRole === 'ADMIN';

  const refetchQueries = [{ query: SAVED_VIEWS, variables: { entity } }];
  const [createView, { loading: saving, error }] = useMutation(
    CREATE_SAVED_VIEW,
    { refetchQueries },
  );
  const [deleteView] = useMutation(DELETE_SAVED_VIEW, { refetchQueries });
  const [setDefault] = useMutation(SET_DEFAULT_SAVED_VIEW, { refetchQueries });
  const [updateView, { loading: aktualisiert, error: updateError }] =
    useMutation(UPDATE_SAVED_VIEW, { refetchQueries });
  const { zeige } = useToast();

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [privat, setPrivat] = useState(false);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  const views = data?.savedViews ?? [];
  const letzteKey = `stegwerk.letzteAnsicht.${entity}`;

  const setActiveId = (id: string | null) => {
    setActiveIdState(id);

    try {
      if (id === null) {
        window.localStorage.removeItem(letzteKey);
      } else {
        window.localStorage.setItem(letzteKey, id);
      }
    } catch {}
  };

  const jetzt: ListenStand = {
    search: controls.variables.search,
    sortField: controls.sortField,
    sortDirection: controls.sortDirection,
    customFilters: controls.customFilters,
    columns: controls.columns,
    filters,
    gruppierung: controls.gruppierung,
    filterVerknuepfung: controls.verknuepfung === 'ODER' ? 'ODER' : null,
    ...(darstellung === undefined
      ? {}
      : {
          darstellung: darstellung.wahl.art,
          gruppenFeld: darstellung.wahl.gruppenFeld,
          datumFeld: darstellung.wahl.datumFeld,
        }),
  };
  const darstellungEingabe =
    darstellung === undefined
      ? {}
      : {
          darstellung: darstellung.wahl.art,
          gruppenFeld: darstellung.wahl.gruppenFeld,
          datumFeld: darstellung.wahl.datumFeld,
        };

  const { data: felderDaten } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
    { variables: { entity } },
  );
  const feldrechte = useFeldrechte();
  const art = entity.toLowerCase() as FeldArt;
  const eigeneKeys = new Set(
    (felderDaten?.customFields ?? [])
      .filter((f) => feldrechte.eigenes(art, f.key) !== 'verborgen')
      .map((f) => f.key),
  );
  const standardKeys = new Set(
    (STANDARD_FILTER_FELDER[entity] ?? [])
      .filter((f) => {
        const recht = feldrechtDesFilters(art, f.key);

        return feldrechte.standard(recht.art, recht.feld) !== 'verborgen';
      })
      .map((f) => f.key),
  );
  const darfFiltern = (key: string) =>
    key.startsWith('std:') ? standardKeys.has(key) : eigeneKeys.has(key);
  const darfSortieren = (feld: string) =>
    feld.startsWith('custom:')
      ? eigeneKeys.has(feld.slice('custom:'.length))
      : feldrechte.standard(art, feld) !== 'verborgen';
  const bereit = felderDaten !== undefined && feldrechte.geladen;

  const anwenden = (roh: ListenStand) => {
    const { stand, entfernt } = bereinigeStand(
      roh,
      darfFiltern,
      darfSortieren,
      controls.standardSortierung,
    );

    controls.applyView(stand);
    onApplyFilters(stand.filters ?? {});
    const ziel = darstellungDesStands(stand);

    if (ziel !== null) {
      darstellung?.setzen({
        art: ziel,
        ...(stand.gruppenFeld === undefined
          ? {}
          : { gruppenFeld: stand.gruppenFeld }),
        ...(stand.datumFeld === undefined
          ? {}
          : { datumFeld: stand.datumFeld }),
      });
    }

    if (entfernt > 0) {
      zeige({
        text:
          entfernt === 1
            ? 'Ein Filter dieser Ansicht gilt für Ihre Rolle nicht oder nicht mehr und wurde weggelassen.'
            : `${String(entfernt)} Filter dieser Ansicht gelten für Ihre Rolle nicht oder nicht mehr und wurden weggelassen.`,
      });
    }
  };

  const apply = (view: SavedView) => {
    setActiveId(view.id);
    anwenden(view);
  };

  const aktive = views.find((view) => view.id === activeId);
  const darfAendern = (view: SavedView) =>
    view.createdById === session?.user.id || (!view.privat && isAdmin);
  const geaendert =
    aktive !== undefined &&
    !gleicherStand(
      jetzt,
      bereinigeStand(
        {
          search: aktive.search,
          sortField: aktive.sortField,
          sortDirection: aktive.sortDirection,
          customFilters: aktive.customFilters,
          columns: aktive.columns,
          filters: aktive.filters ?? {},
          gruppierung: aktive.gruppierung,
          filterVerknuepfung: aktive.filterVerknuepfung,
          ...(darstellung === undefined
            ? {}
            : {
                darstellung: aktive.darstellung ?? darstellung.wahl.art,
                gruppenFeld: aktive.gruppenFeld ?? null,
                datumFeld: aktive.datumFeld ?? null,
              }),
        },
        darfFiltern,
        darfSortieren,
        controls.standardSortierung,
      ).stand,
    );

  const linkKopieren = async () => {
    const url = new URL(window.location.href);

    url.searchParams.set(PARAMETER, standKodieren(jetzt));

    try {
      await navigator.clipboard.writeText(url.toString());
      zeige({ text: 'Link zu dieser Ansicht kopiert.' });
    } catch {
      window.prompt('Link zu dieser Ansicht:', url.toString());
    }
  };

  const appliedDefault = useRef(false);

  useEffect(() => {
    if (appliedDefault.current || data === undefined || !bereit) {
      return;
    }

    appliedDefault.current = true;

    const ausLink = standLesen(
      new URLSearchParams(window.location.search).get(PARAMETER),
    );

    if (ausLink !== null) {
      setActiveIdState(null);
      anwenden(ausLink);

      const url = new URL(window.location.href);

      url.searchParams.delete(PARAMETER);
      window.history.replaceState(window.history.state, '', url.toString());

      return;
    }

    let letzte: string | null = null;

    try {
      letzte = window.localStorage.getItem(letzteKey);
    } catch {
      letzte = null;
    }

    const preferred =
      views.find((view) => view.id === letzte) ??
      views.find((view) => view.isDefault);

    if (preferred !== undefined) {
      apply(preferred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, bereit]);

  const save = async () => {
    const result = await createView({
      variables: {
        input: {
          entity,
          name: name.trim(),
          search: controls.variables.search,
          sortField: controls.sortField,
          sortDirection: controls.sortDirection,
          customFilters: controls.customFilters,
          columns: controls.columns,
          filters,
          privat,
          gruppierung: jetzt.gruppierung,
          filterVerknuepfung: jetzt.filterVerknuepfung,
          ...darstellungEingabe,
        },
      },
    }).catch(() => null);

    const neu = (result?.data as { createSavedView?: SavedView } | null)
      ?.createSavedView;

    if (neu != null) {
      setName('');
      setPrivat(false);
      setNaming(false);
      setActiveId(neu.id);
    }
  };

  const aktualisieren = (view: SavedView) =>
    void updateView({
      variables: {
        input: {
          id: view.id,
          search: jetzt.search ?? '',
          sortField: jetzt.sortField,
          sortDirection: jetzt.sortDirection,
          customFilters: jetzt.customFilters,
          columns: jetzt.columns,
          filters: jetzt.filters,
          gruppierung: jetzt.gruppierung,
          filterVerknuepfung: jetzt.filterVerknuepfung,
          ...darstellungEingabe,
        },
      },
    })
      .then(() => zeige({ text: `Ansicht „${view.name}“ aktualisiert.` }))
      .catch(() => null);

  return (
    <div className="saved-views">
      {(error ?? updateError) !== undefined && (
        <div className="error-banner">{(error ?? updateError)?.message}</div>
      )}

      <div className="saved-views__row">
        {views.map((view) => (
          <span
            key={view.id}
            className={
              view.id === activeId ? 'view-chip is-active' : 'view-chip'
            }
          >
            <button
              type="button"
              className="view-chip__apply"
              onClick={() => apply(view)}
              title={view.privat ? 'Nur für Sie sichtbar' : undefined}
            >
              {view.privat && (
                <span className="view-chip__privat" aria-label="privat">
                  <IconLock size={12} />
                </span>
              )}
              {view.name}
              {darstellung !== undefined &&
                view.darstellung !== null &&
                ART_LABEL[view.darstellung] !== undefined && (
                  <span
                    className="view-chip__art"
                    title={`Öffnet als ${ART_LABEL[view.darstellung]}`}
                  >
                    {' '}
                    · {ART_LABEL[view.darstellung]}
                  </span>
                )}
            </button>
            <button
              type="button"
              className={
                view.isDefault
                  ? 'view-chip__default is-set'
                  : 'view-chip__default'
              }
              aria-pressed={view.isDefault}
              aria-label={`Ansicht "${view.name}" beim Öffnen anzeigen`}
              title={
                view.isDefault
                  ? 'Wird beim Öffnen angezeigt — klicken zum Aufheben'
                  : 'Beim Öffnen anzeigen'
              }
              onClick={() =>
                void setDefault({
                  variables: {
                    entity,
                    id: view.isDefault ? null : view.id,
                  },
                })
              }
            >
              <IconStar filled={view.isDefault} size={14} />
            </button>

            {darfAendern(view) && (
              <button
                type="button"
                className="view-chip__remove"
                aria-label={`Ansicht "${view.name}" löschen`}
                onClick={() => {
                  if (view.id === activeId) {
                    setActiveId(null);
                  }

                  void deleteView({ variables: { id: view.id } });
                }}
              >
                <IconClose size={12} />
              </button>
            )}
          </span>
        ))}

        {naming ? (
          <form
            className="saved-views__form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="saved-views__privat">
              <input
                type="checkbox"
                checked={privat}
                onChange={(event) => setPrivat(event.target.checked)}
              />
              Nur für mich
            </label>
            <input
              autoFocus
              maxLength={80}
              value={name}
              placeholder="Name der Ansicht"
              aria-label="Name der Ansicht"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setNaming(false);
                }
              }}
            />
            <button
              className="button button--small"
              type="submit"
              disabled={saving || name.trim() === ''}
            >
              Speichern
            </button>
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={() => setNaming(false)}
            >
              Abbrechen
            </button>
          </form>
        ) : (
          <>
            {aktive !== undefined && geaendert && (
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => anwenden(aktive)}
                title="Zurück zum gespeicherten Stand dieser Ansicht"
              >
                Änderungen verwerfen
              </button>
            )}
            {aktive !== undefined && geaendert && darfAendern(aktive) && (
              <button
                type="button"
                className="button button--small"
                disabled={aktualisiert}
                onClick={() => aktualisieren(aktive)}
              >
                „{aktive.name}“ aktualisieren
              </button>
            )}
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setNaming(true)}
            >
              {geaendert ? 'Als neue Ansicht speichern' : 'Ansicht speichern'}
            </button>
            {aktive !== undefined && (
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => {
                  setActiveId(null);
                  anwenden({
                    search: null,
                    sortField: null,
                    sortDirection: null,
                    customFilters: [],
                    columns: [],
                    filters: {},
                    gruppierung: null,
                    filterVerknuepfung: null,
                    darstellung: jetzt.darstellung,
                    gruppenFeld: jetzt.gruppenFeld,
                    datumFeld: jetzt.datumFeld,
                  });
                }}
              >
                Ohne Ansicht
              </button>
            )}
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void linkKopieren()}
              title={
                darstellung === undefined
                  ? 'Link mit Suche, Filtern, Sortierung, Gruppen und Spalten kopieren'
                  : 'Link mit Suche, Filtern, Sortierung, Gruppen, Spalten und Darstellung (Liste, Board, Kalender) kopieren'
              }
            >
              Link kopieren
            </button>
          </>
        )}
      </div>
    </div>
  );
};
