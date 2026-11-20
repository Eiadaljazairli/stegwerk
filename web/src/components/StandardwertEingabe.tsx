import { useEffect, useState } from 'react';

import { type CustomField } from '../lib/types';

const GETIPPT: CustomField['type'][] = [
  'TEXT',
  'NUMBER',
  'CURRENCY',
  'URL',
  'EMAIL',
  'PHONE',
];

type Props = {
  type: CustomField['type'];
  options: string[];
  wert: string;
  id: string;
  ariaLabel?: string;
  onChange: (roh: string) => void;
  sofort?: boolean;
};

export const StandardwertEingabe = ({
  type,
  options,
  wert,
  id,
  ariaLabel,
  onChange,
  sofort = false,
}: Props) => {
  const [entwurf, setEntwurf] = useState(wert);

  useEffect(() => setEntwurf(wert), [wert]);

  if (type === 'BOOLEAN' || type === 'SELECT' || type === 'RATING') {
    const auswahl =
      type === 'BOOLEAN'
        ? [
            { wert: 'true', text: 'Ja' },
            { wert: 'false', text: 'Nein' },
          ]
        : type === 'RATING'
          ? [1, 2, 3, 4, 5].map((stern) => ({
              wert: String(stern),
              text: `${String(stern)} von 5 Sternen`,
            }))
          : options.map((option) => ({ wert: option, text: option }));

    return (
      <select
        id={id}
        className="cell-hint"
        aria-label={ariaLabel}
        value={wert}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">kein Standardwert</option>
        {auswahl.map((eintrag) => (
          <option key={eintrag.wert} value={eintrag.wert}>
            {eintrag.text}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'MULTI_SELECT') {
    const gewaehlt = wert === '' ? [] : wert.split(';');

    return (
      <fieldset
        id={id}
        className="standardwert-mehrfach"
        aria-label={ariaLabel ?? 'Standardwert'}
      >
        {options.map((option) => (
          <label key={option} className="field--inline">
            <input
              type="checkbox"
              checked={gewaehlt.includes(option)}
              onChange={(event) =>
                onChange(
                  options
                    .filter((o) =>
                      o === option
                        ? event.target.checked
                        : gewaehlt.includes(o),
                    )
                    .join(';'),
                )
              }
            />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (type === 'DATE') {
    return (
      <input
        id={id}
        type="date"
        className="cell-input"
        aria-label={ariaLabel}
        value={sofort ? wert : entwurf}
        onChange={(event) =>
          sofort ? onChange(event.target.value) : setEntwurf(event.target.value)
        }
        onBlur={() => {
          if (!sofort && entwurf !== wert) {
            onChange(entwurf);
          }
        }}
        onKeyDown={(event) => {
          if (!sofort && event.key === 'Enter') {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    );
  }

  if (!GETIPPT.includes(type)) {
    return null;
  }

  const zahl = type === 'NUMBER' || type === 'CURRENCY';

  return (
    <input
      id={id}
      className="cell-input"
      aria-label={ariaLabel}
      inputMode={
        zahl
          ? 'decimal'
          : type === 'EMAIL'
            ? 'email'
            : type === 'PHONE'
              ? 'tel'
              : type === 'URL'
                ? 'url'
                : undefined
      }
      maxLength={500}
      placeholder="kein Standardwert"
      value={sofort ? wert : entwurf}
      onChange={(event) =>
        sofort ? onChange(event.target.value) : setEntwurf(event.target.value)
      }
      onBlur={() => {
        if (!sofort && entwurf.trim() !== wert) {
          onChange(entwurf);
        }
      }}
      onKeyDown={(event) => {
        if (!sofort && event.key === 'Enter') {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};
