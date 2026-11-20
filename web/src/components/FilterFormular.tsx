import { type FormEvent, type ReactNode, useState } from 'react';

import {
  filterAusStand,
  type FormularStand,
  standAusFilter,
  standPruefen,
} from '../lib/filterFormular';
import {
  CUSTOM_FILTER_OPERATOR_LABELS,
  type CustomField,
  type CustomFieldFilter,
  type CustomFieldFilterOperator,
  OPERATORS_FOR_TYPE,
  OPERATORS_WITHOUT_VALUE,
  TAGE_OPERATOREN,
} from '../lib/types';
import { leseZahl } from '../lib/zahl';
import { VerweisWahl } from './Verweise';

export type FilterFelder = {
  standard: CustomField[];
  firma: CustomField[];
  eigene: CustomField[];
};

export const FilterFormular = ({
  felder,
  start,
  zusatz,
  gesperrt = false,
  submitLabel,
  onSubmit,
  onAbbrechen,
  className = 'custom-filters__form',
  autoFocus = false,
}: {
  felder: FilterFelder;
  start?: CustomFieldFilter;
  zusatz?: ReactNode;
  gesperrt?: boolean;
  submitLabel: string;
  onSubmit: (filter: CustomFieldFilter) => void;
  onAbbrechen?: () => void;
  className?: string;
  autoFocus?: boolean;
}) => {
  const alle = [...felder.standard, ...felder.firma, ...felder.eigene];
  const byKey = new Map(alle.map((field) => [field.key, field]));

  const [key, setKey] = useState(start?.key ?? '');
  const startFeld = start === undefined ? undefined : byKey.get(start.key);
  const [stand, setStand] = useState<FormularStand>(() =>
    start !== undefined && startFeld !== undefined
      ? standAusFilter(start, startFeld.type)
      : { operator: 'EQUALS', value: '', mehrere: [] },
  );

  const selected = byKey.get(key);
  const operators =
    selected === undefined ? [] : OPERATORS_FOR_TYPE[selected.type];
  const { operator, value, mehrere } = stand;
  const needsValue = !OPERATORS_WITHOUT_VALUE.includes(operator);
  const nachTagen = TAGE_OPERATOREN.includes(operator);
  const mitListe = selected?.type === 'MULTI_SELECT';
  const pruefung =
    selected === undefined
      ? { braucht: true, ok: false }
      : standPruefen(selected.type, stand);

  const setValue = (neu: string) => setStand((alt) => ({ ...alt, value: neu }));

  const absenden = (event: FormEvent) => {
    event.preventDefault();

    if (selected === undefined || gesperrt) {
      return;
    }

    const filter = filterAusStand(key, selected.type, stand);

    if (filter === null) {
      return;
    }

    onSubmit(filter);

    if (start === undefined) {
      setStand((alt) => ({ ...alt, value: '', mehrere: [] }));
    }
  };

  return (
    <form
      className={className}
      onSubmit={absenden}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onAbbrechen !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          onAbbrechen();
        }
      }}
    >
      {start === undefined ? (
        <select
          aria-label="Feld"
          value={key}
          onChange={(event) => {
            const next = byKey.get(event.target.value);

            setKey(event.target.value);
            setStand({
              operator:
                next === undefined
                  ? 'EQUALS'
                  : OPERATORS_FOR_TYPE[next.type][0],
              value: '',
              mehrere: [],
            });
          }}
        >
          <option value="">Filtern nach …</option>
          <optgroup label="Felder">
            {felder.standard.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </optgroup>
          {felder.firma.length > 0 && (
            <optgroup label="Felder der Firma">
              {felder.firma.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </optgroup>
          )}
          {felder.eigene.length > 0 && (
            <optgroup label="Eigene Felder">
              {felder.eigene.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      ) : (
        <span className="filter-formular__feld">
          {selected?.label ?? start.key}
        </span>
      )}

      {selected !== undefined && (
        <>
          <select
            aria-label="Vergleich"
            value={operator}
            autoFocus={autoFocus}
            onChange={(event) => {
              const neu = event.target.value as CustomFieldFilterOperator;

              setStand((alt) => ({
                ...alt,
                operator: neu,
                value:
                  TAGE_OPERATOREN.includes(neu) !==
                  TAGE_OPERATOREN.includes(alt.operator)
                    ? ''
                    : alt.value,
              }));
            }}
          >
            {operators.map((option) => (
              <option key={option} value={option}>
                {CUSTOM_FILTER_OPERATOR_LABELS[option]}
              </option>
            ))}
          </select>

          {needsValue &&
            (nachTagen ? (
              <span className="custom-filters__tage">
                <input
                  aria-label="Anzahl Tage"
                  type="number"
                  min={0}
                  max={3650}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
                Tagen
              </span>
            ) : mitListe ? (
              <span className="custom-filters__mehrere">
                {selected.options.map((option) => (
                  <label key={option} className="custom-filters__option">
                    <input
                      type="checkbox"
                      checked={mehrere.includes(option)}
                      onChange={(event) =>
                        setStand((alt) => ({
                          ...alt,
                          mehrere: event.target.checked
                            ? [...alt.mehrere, option]
                            : alt.mehrere.filter((entry) => entry !== option),
                        }))
                      }
                    />
                    {option}
                  </label>
                ))}
              </span>
            ) : selected.type === 'RELATION' ? (
              <VerweisWahl
                art={selected.zielEntity}
                wert={value}
                label={selected.label}
                onChange={setValue}
              />
            ) : selected.type === 'SELECT' ? (
              <select
                aria-label="Wert"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                <option value="">—</option>
                {selected.options.map((option) => (
                  <option key={option} value={option}>
                    {selected.optionLabels?.[option] ?? option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Wert"
                type={
                  selected.type === 'RATING'
                    ? 'number'
                    : selected.type === 'DATE'
                      ? 'date'
                      : 'text'
                }
                inputMode={
                  ['NUMBER', 'CURRENCY'].includes(selected.type)
                    ? 'decimal'
                    : undefined
                }
                aria-invalid={
                  ['NUMBER', 'CURRENCY'].includes(selected.type) &&
                  value.trim() !== '' &&
                  leseZahl(value) === undefined
                    ? true
                    : undefined
                }
                {...(selected.type === 'RATING' ? { min: 1, max: 5 } : {})}
                value={value}
                placeholder={selected.type === 'BOOLEAN' ? 'ja / nein' : ''}
                onChange={(event) => setValue(event.target.value)}
              />
            ))}

          {zusatz}

          <button
            className="button button--ghost button--small"
            type="submit"
            disabled={gesperrt || !pruefung.ok}
          >
            {submitLabel}
          </button>
          {onAbbrechen !== undefined && (
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={onAbbrechen}
            >
              Abbrechen
            </button>
          )}
        </>
      )}
    </form>
  );
};
