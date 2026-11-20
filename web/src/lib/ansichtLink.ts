import { type CustomFieldFilter } from './types';

export type ListenStand = {
  search: string | null;
  sortField: string | null;
  sortDirection: string | null;
  customFilters: CustomFieldFilter[];
  columns: string[];
  filters: Record<string, string | number | boolean | null>;
  gruppierung?: string | null;
  filterVerknuepfung?: string | null;
  darstellung?: string | null;
  gruppenFeld?: string | null;
  datumFeld?: string | null;
};

export type Darstellung = 'liste' | 'board' | 'kalender';

const DARSTELLUNGEN: readonly string[] = ['liste', 'board', 'kalender'];

const FELD = /^(std|custom):[A-Za-z0-9_]{1,70}$/u;

export const darstellungDesStands = (
  stand: Pick<ListenStand, 'darstellung'>,
): Darstellung | null =>
  typeof stand.darstellung === 'string' &&
  DARSTELLUNGEN.includes(stand.darstellung)
    ? (stand.darstellung as Darstellung)
    : null;

export const PARAMETER = 'ansicht';

const nachBase64url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const ausBase64url = (wert: string): string => {
  const b64 = wert.replace(/-/g, '+').replace(/_/g, '/');
  const roh = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));

  return new TextDecoder().decode(
    Uint8Array.from(roh, (zeichen) => zeichen.charCodeAt(0)),
  );
};

export const standKodieren = (stand: ListenStand): string =>
  nachBase64url(JSON.stringify(stand));

const istWert = (x: unknown): x is string | number | boolean | null =>
  x === null || ['string', 'number', 'boolean'].includes(typeof x);

const textOderNull = (x: unknown): string | null =>
  typeof x === 'string' && x.length <= 200 ? x : null;

export const standLesen = (wert: string | null): ListenStand | null => {
  if (wert === null || wert === '' || wert.length > 8000) {
    return null;
  }

  let roh: unknown;

  try {
    roh = JSON.parse(ausBase64url(wert));
  } catch {
    return null;
  }

  if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) {
    return null;
  }

  const o = roh as Record<string, unknown>;
  const customFilters = Array.isArray(o.customFilters)
    ? o.customFilters
        .filter(
          (f): f is CustomFieldFilter =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as CustomFieldFilter).key === 'string' &&
            typeof (f as CustomFieldFilter).operator === 'string',
        )
        .map((f) => {
          const gruppe = f.gruppe;

          const teil: CustomFieldFilter = { key: f.key, operator: f.operator };

          if (typeof f.value === 'string') {
            teil.value = f.value;
          }

          if (
            typeof gruppe === 'number' &&
            Number.isInteger(gruppe) &&
            gruppe >= 1 &&
            gruppe <= 5
          ) {
            teil.gruppe = gruppe;
          }

          return teil;
        })
    : [];
  const columns = Array.isArray(o.columns)
    ? o.columns.filter((c): c is string => typeof c === 'string')
    : [];
  const filters =
    typeof o.filters === 'object' &&
    o.filters !== null &&
    !Array.isArray(o.filters)
      ? Object.fromEntries(
          Object.entries(o.filters as Record<string, unknown>).filter(
            (eintrag): eintrag is [string, string | number | boolean | null] =>
              istWert(eintrag[1]),
          ),
        )
      : {};

  return {
    search: textOderNull(o.search),
    sortField: textOderNull(o.sortField),
    sortDirection: o.sortDirection === 'DESC' ? 'DESC' : 'ASC',
    customFilters,
    columns,
    filters,
    ...(typeof o.gruppierung === 'string' &&
    /^(std|custom):[A-Za-z0-9_]{1,70}$/u.test(o.gruppierung)
      ? { gruppierung: o.gruppierung }
      : {}),
    ...(o.filterVerknuepfung === 'ODER' ? { filterVerknuepfung: 'ODER' } : {}),
    ...(typeof o.darstellung === 'string' &&
    DARSTELLUNGEN.includes(o.darstellung)
      ? { darstellung: o.darstellung }
      : {}),
    ...(typeof o.gruppenFeld === 'string' && FELD.test(o.gruppenFeld)
      ? { gruppenFeld: o.gruppenFeld }
      : {}),
    ...(typeof o.datumFeld === 'string' && FELD.test(o.datumFeld)
      ? { datumFeld: o.datumFeld }
      : {}),
  };
};

const ordnen = (wert: unknown): unknown =>
  Array.isArray(wert)
    ? wert.map(ordnen)
    : typeof wert === 'object' && wert !== null
      ? Object.fromEntries(
          Object.entries(wert as Record<string, unknown>)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, ordnen(v)]),
        )
      : wert;

export const gleicherStand = (a: ListenStand, b: ListenStand): boolean =>
  JSON.stringify(ordnen(vergleichbar(a))) ===
  JSON.stringify(ordnen(vergleichbar(b)));

const vergleichbar = (stand: ListenStand) => ({
  ...stand,
  search: stand.search?.trim() || null,
  gruppierung: stand.gruppierung ?? null,
  filterVerknuepfung: stand.filterVerknuepfung === 'ODER' ? 'ODER' : null,
  darstellung:
    stand.darstellung === 'board' || stand.darstellung === 'kalender'
      ? stand.darstellung
      : null,
  gruppenFeld: stand.gruppenFeld ?? null,
  datumFeld: stand.datumFeld ?? null,
});

export const bereinigeStand = (
  stand: ListenStand,
  darfFiltern: (key: string) => boolean,
  darfSortieren: (sortField: string) => boolean,
  ersatz: Pick<ListenStand, 'sortField' | 'sortDirection'> = {
    sortField: null,
    sortDirection: null,
  },
): { stand: ListenStand; entfernt: number } => {
  const customFilters = stand.customFilters.filter((f) => darfFiltern(f.key));
  const sortOk = stand.sortField === null || darfSortieren(stand.sortField);

  return {
    stand: {
      ...stand,
      customFilters,
      ...(sortOk ? {} : ersatz),
    },
    entfernt:
      stand.customFilters.length - customFilters.length + (sortOk ? 0 : 1),
  };
};
