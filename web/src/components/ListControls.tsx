import { type ListControls, PAGE_SIZE } from '../lib/useListControls';
import { IconArrowDown, IconArrowUp } from './Icons';

export const SearchInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <div className="search">
    <input
      type="search"
      className="search__input"
      placeholder={placeholder}
      value={value}
      maxLength={200}
      onChange={(event) => onChange(event.target.value)}
      aria-label={placeholder}
    />
  </div>
);

export const SortableHeader = ({
  field,
  label,
  controls,
  numeric = false,
}: {
  field: string;
  label: string;
  controls: ListControls;
  numeric?: boolean;
}) => {
  const isActive = controls.sortField === field;

  return (
    <th
      className={numeric ? 'numeric' : undefined}
      aria-sort={
        isActive
          ? controls.sortDirection === 'ASC'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        className={isActive ? 'sort-header is-active' : 'sort-header'}
        onClick={() => controls.toggleSort(field)}
      >
        {label}
        <span className="sort-header__arrow" aria-hidden="true">
          {isActive &&
            (controls.sortDirection === 'ASC' ? (
              <IconArrowUp size={12} />
            ) : (
              <IconArrowDown size={12} />
            ))}
        </span>
      </button>
    </th>
  );
};

export const Pagination = ({
  controls,
  totalCount,
  hasMore,
}: {
  controls: ListControls;
  totalCount: number;
  hasMore: boolean;
}) => {
  const pageCount = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);
  const firstOnPage = totalCount === 0 ? 0 : controls.page * PAGE_SIZE + 1;
  const lastOnPage = Math.min((controls.page + 1) * PAGE_SIZE, totalCount);

  if (totalCount <= PAGE_SIZE) {
    return (
      <div className="pagination__summary">
        {totalCount} {totalCount === 1 ? 'Eintrag' : 'Einträge'}
      </div>
    );
  }

  return (
    <div className="pagination">
      <div className="pagination__summary">
        {firstOnPage}–{lastOnPage} von {totalCount}
      </div>
      <div className="pagination__buttons">
        <button
          type="button"
          className="button button--ghost"
          disabled={controls.page === 0}
          onClick={() => controls.goToPage(controls.page - 1)}
        >
          Zurück
        </button>
        <span className="pagination__page">
          Seite {controls.page + 1} von {pageCount}
        </span>
        <button
          type="button"
          className="button button--ghost"
          disabled={!hasMore}
          onClick={() => controls.goToPage(controls.page + 1)}
        >
          Weiter
        </button>
      </div>
    </div>
  );
};
