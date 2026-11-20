import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { leseZahl } from '../lib/zahl';
import { useFeldHinweis } from './FeldHinweis';

type EditableFieldProps = {
  label: string;
  value: string | number | boolean | null;
  type?: 'text' | 'number' | 'date' | 'email' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  format?: (value: string | number) => ReactNode;
  aktion?: ReactNode;
  nurLesen?: boolean;
  hinweis?: string | null;
  onSave: (value: string) => void | Promise<unknown>;
};

const asText = (value: string | number | boolean | null): string => {
  if (value === null) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
};

export const EditableField = ({
  label,
  value,
  type = 'text',
  options = [],
  placeholder = '—',
  required = false,
  format,
  aktion,
  nurLesen = false,
  hinweis,
  onSave,
}: EditableFieldProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const feldHinweis = useFeldHinweis(label, hinweis, isEditing);
  const [draft, setDraft] = useState('');
  const [unlesbar, setUnlesbar] = useState(false);
  const [ausgangswert, setAusgangswert] = useState('');
  const konfliktId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    if (type === 'select') {
      selectRef.current?.focus();

      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing, type]);

  const beginEditing = () => {
    setDraft(asText(value));
    setAusgangswert(asText(value));
    setIsEditing(true);
  };

  const konflikt = isEditing && asText(value) !== ausgangswert;
  const beschrieben =
    [feldHinweis.beschreibtId, konflikt ? konfliktId : undefined]
      .filter((teil) => teil !== undefined)
      .join(' ') || undefined;

  const neuenWertUebernehmen = () => {
    setDraft(asText(value));
    setAusgangswert(asText(value));
    setUnlesbar(false);
    inputRef.current?.focus();
  };

  const konfliktHinweis = konflikt && (
    <div className="feld-konflikt" id={konfliktId} role="alert">
      <span>
        Inzwischen von anderer Stelle geändert auf „
        {asText(value) === '' ? 'leer' : asText(value)}“. Speichern überschreibt
        das, Esc verwirft Ihre Eingabe.
      </span>
      {type !== 'select' && (
        <button
          type="button"
          className="button button--ghost button--small"
          onMouseDown={(event) => event.preventDefault()}
          onClick={neuenWertUebernehmen}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setUnlesbar(false);
              setIsEditing(false);
            }
          }}
        >
          Neuen Wert übernehmen
        </button>
      )}
    </div>
  );

  const commit = (eingabe = draft, ausdruecklich = false) => {
    if (!ausdruecklich && eingabe === ausgangswert) {
      setUnlesbar(false);
      setIsEditing(false);

      return;
    }

    let next = eingabe;

    if (type === 'number') {
      const zahl = leseZahl(eingabe);

      if (zahl === undefined) {
        setUnlesbar(true);

        return;
      }

      next = zahl === null ? '' : String(zahl);
    }

    setUnlesbar(false);
    setIsEditing(false);

    if (next === asText(value)) {
      return;
    }

    void Promise.resolve(onSave(next)).catch(() => null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft, true);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setUnlesbar(false);
      setIsEditing(false);
    }
  };

  if (type === 'boolean') {
    return (
      <div className="detail-field">
        <div className="detail-field__label">
          {label}
          {required && <span className="detail-field__required">*</span>}
          {feldHinweis.knopf}
        </div>
        {feldHinweis.text}
        <button
          type="button"
          className="detail-field__value"
          aria-describedby={feldHinweis.beschreibtId}
          onClick={() =>
            void Promise.resolve(
              onSave(value === true ? 'false' : 'true'),
            ).catch(() => null)
          }
          aria-pressed={value === true}
        >
          <span className={value === true ? 'badge badge--positive' : 'badge'}>
            {value === true ? 'Ja' : 'Nein'}
          </span>
        </button>
      </div>
    );
  }

  const display = () => {
    if (value === null || value === '') {
      return <span className="detail-field__empty">{placeholder}</span>;
    }

    if (format !== undefined && typeof value !== 'boolean') {
      return format(value);
    }

    return String(value);
  };

  return (
    <div className="detail-field">
      <div className="detail-field__label">
        {label}
        {required && <span className="detail-field__required">*</span>}
        {feldHinweis.knopf}
      </div>
      {feldHinweis.text}

      {isEditing ? (
        type === 'select' ? (
          <select
            ref={selectRef}
            className="detail-field__input"
            aria-describedby={beschrieben}
            value={draft}
            onChange={(event) => commit(event.target.value, true)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={handleKeyDown}
          >
            {!required && <option value="">—</option>}
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <div
            className="detail-field__bearbeiten"
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }

              commit();
            }}
          >
            <input
              ref={inputRef}
              className="detail-field__input"
              aria-describedby={beschrieben}
              type={type === 'number' ? 'text' : type}
              inputMode={type === 'number' ? 'decimal' : undefined}
              aria-invalid={unlesbar || undefined}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setUnlesbar(false);
              }}
              onKeyDown={handleKeyDown}
            />
            {unlesbar && (
              <span className="detail-field__fehler" role="alert">
                Keine Zahl — etwa 1.500 oder 2500,50.
              </span>
            )}
            {konfliktHinweis}
          </div>
        )
      ) : nurLesen ? (
        <div
          className="detail-field__value detail-field__value--static"
          title="Ihre Rolle darf dieses Feld nicht ändern."
          aria-describedby={feldHinweis.beschreibtId}
        >
          {display()}
        </div>
      ) : (
        <button
          type="button"
          className="detail-field__value"
          aria-describedby={feldHinweis.beschreibtId}
          onClick={beginEditing}
        >
          {display()}
        </button>
      )}
      {type === 'select' && konfliktHinweis}
      {!isEditing && aktion}
    </div>
  );
};
