import { useEffect, useMemo, useState } from 'react';

import { filterErsetzen } from './filterFormular';
import { type CustomFieldFilter, type FilterVerknuepfung } from './types';

export type SortDirection = 'ASC' | 'DESC';

export const PAGE_SIZE = 25;

const SEARCH_DEBOUNCE_MS = 250;

export type ListControls = {
  columns: string[];
  setColumns: (columns: string[]) => void;
  customFilters: CustomFieldFilter[];
  addCustomFilter: (filter: CustomFieldFilter) => void;
  removeCustomFilter: (index: number) => void;
  updateCustomFilter: (index: number, filter: CustomFieldFilter) => void;
  setCustomFilters: (filters: CustomFieldFilter[]) => void;
  verknuepfung: FilterVerknuepfung;
  setVerknuepfung: (verknuepfung: FilterVerknuepfung) => void;
  gruppierung: string | null;
  setGruppierung: (gruppierung: string | null) => void;
  applyView: (view: {
    search: string | null;
    sortField: string | null;
    sortDirection: string | null;
    customFilters: CustomFieldFilter[];
    columns?: string[];
    gruppierung?: string | null;
    filterVerknuepfung?: string | null;
  }) => void;
  search: string;
  setSearch: (value: string) => void;
  sortField: string;
  sortDirection: SortDirection;
  standardSortierung: { sortField: string; sortDirection: SortDirection };
  toggleSort: (field: string) => void;
  page: number;
  goToPage: (page: number) => void;
  variables: {
    search: string | null;
    limit: number;
    offset: number;
    sortField: string;
    sortDirection: SortDirection;
    customFilters: CustomFieldFilter[] | null;
    filterVerknuepfung: FilterVerknuepfung | null;
    gruppierung: string | null;
  };
};

const columnsKey = (list: string) => `stegwerk.columns.${list}`;

const readColumns = (list: string | undefined): string[] => {
  if (list === undefined) {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(columnsKey(list));
    const parsed: unknown = stored === null ? null : JSON.parse(stored);

    return Array.isArray(parsed) && parsed.every((e) => typeof e === 'string')
      ? (parsed as string[])
      : [];
  } catch {
    return [];
  }
};

export const useListControls = (
  defaultSortField: string,
  defaultSortDirection: SortDirection = 'ASC',
  list?: string,
): ListControls => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState(defaultSortField);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultSortDirection);
  const [page, setPage] = useState(0);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [verknuepfung, setVerknuepfung] = useState<FilterVerknuepfung>('UND');
  const [gruppierung, setGruppierung] = useState<string | null>(null);
  const [columns, setColumnsState] = useState<string[]>(() =>
    readColumns(list),
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, sortField, sortDirection, customFilters, verknuepfung]);

  const toggleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection((current) => (current === 'ASC' ? 'DESC' : 'ASC'));

      return;
    }

    setSortField(field);
    setSortDirection('ASC');
  };

  const setColumns = (next: string[]) => {
    setColumnsState(next);

    if (list === undefined) {
      return;
    }

    try {
      window.localStorage.setItem(columnsKey(list), JSON.stringify(next));
    } catch {}
  };

  const variables = useMemo(
    () => ({
      search: debouncedSearch.trim() === '' ? null : debouncedSearch.trim(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sortField,
      sortDirection,
      customFilters: customFilters.length === 0 ? null : customFilters,
      filterVerknuepfung:
        verknuepfung === 'ODER' && customFilters.length > 1
          ? ('ODER' as const)
          : null,
      gruppierung,
    }),
    [
      debouncedSearch,
      page,
      sortField,
      sortDirection,
      customFilters,
      verknuepfung,
      gruppierung,
    ],
  );

  return {
    columns,
    setColumns,
    customFilters,
    applyView: (view) => {
      setSearch(view.search ?? '');
      setDebouncedSearch(view.search ?? '');
      setSortField(view.sortField ?? defaultSortField);
      setSortDirection(
        view.sortDirection === 'DESC' ? 'DESC' : defaultSortDirection,
      );
      setCustomFilters(view.customFilters);
      setVerknuepfung(view.filterVerknuepfung === 'ODER' ? 'ODER' : 'UND');
      setGruppierung(view.gruppierung ?? null);

      if (view.columns !== undefined && view.columns.length > 0) {
        setColumns(view.columns);
      }
    },
    addCustomFilter: (filter: CustomFieldFilter) =>
      setCustomFilters((current) => [...current, filter]),
    updateCustomFilter: (index: number, filter: CustomFieldFilter) =>
      setCustomFilters((current) => filterErsetzen(current, index, filter)),
    setCustomFilters,
    verknuepfung,
    setVerknuepfung,
    gruppierung,
    setGruppierung,
    removeCustomFilter: (index: number) => {
      const rest = customFilters.filter((_, position) => position !== index);

      setCustomFilters(rest);

      if (rest.length === 0) {
        setVerknuepfung('UND');
      }
    },
    search,
    setSearch,
    sortField,
    sortDirection,
    standardSortierung: {
      sortField: defaultSortField,
      sortDirection: defaultSortDirection,
    },
    toggleSort,
    page,
    goToPage: setPage,
    variables,
  };
};
