import {
  RECURRENCE_MODE_LABELS,
  RECURRENCE_MODES,
  type RecurrenceForm,
  WEEKDAY_SHORT,
} from '../lib/recurrence-form';

const UNITS: Record<RecurrenceForm['mode'], readonly [string, string]> = {
  NONE: ['Mal', 'Mal'],
  DAILY: ['Tag', 'Tage'],
  WEEKLY: ['Woche', 'Wochen'],
  MONTHLY: ['Monat', 'Monate'],
  MONTHLY_WEEKDAY: ['Monat', 'Monate'],
  YEARLY: ['Jahr', 'Jahre'],
};

export const RecurrenceFields = ({
  value,
  startDate,
  onChange,
}: {
  value: RecurrenceForm;
  startDate: string;
  onChange: (next: RecurrenceForm) => void;
}): JSX.Element => (
  <>
    <div className="field">
      <label htmlFor="appointment-repeat">Wiederholung</label>
      <select
        id="appointment-repeat"
        value={value.mode}
        onChange={(event) =>
          onChange({
            ...value,
            mode: event.target.value as RecurrenceForm['mode'],
          })
        }
      >
        {RECURRENCE_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {RECURRENCE_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </div>

    {value.mode !== 'NONE' && (
      <div className="field">
        <label htmlFor="appointment-interval">Abstand</label>
        <div className="row-actions">
          <span className="field__hint">
            {value.interval === 1 ? 'jede' : 'alle'}
          </span>
          <input
            id="appointment-interval"
            className="input--narrow"
            type="number"
            min={1}
            max={99}
            value={value.interval}
            onChange={(event) =>
              onChange({
                ...value,
                interval: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
          <span className="field__hint">
            {UNITS[value.mode][value.interval === 1 ? 0 : 1]}
          </span>
        </div>
      </div>
    )}

    {value.mode === 'WEEKLY' && (
      <div className="field field--wide">
        <label>An welchen Tagen</label>
        <div className="weekday-picker">
          {WEEKDAY_SHORT.map((label, index) => {
            const gewaehlt = value.weekdays.includes(index);

            return (
              <button
                key={label}
                type="button"
                className={
                  gewaehlt
                    ? 'weekday-picker__day weekday-picker__day--on'
                    : 'weekday-picker__day'
                }
                aria-pressed={gewaehlt}
                onClick={() =>
                  onChange({
                    ...value,
                    weekdays: gewaehlt
                      ? value.weekdays.filter((day) => day !== index)
                      : [...value.weekdays, index],
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="field__hint">
          Nichts angeklickt heißt: am Wochentag des ersten Termins.
        </p>
      </div>
    )}

    {value.mode === 'MONTHLY_WEEKDAY' && (
      <p className="field__hint field--wide">
        Richtet sich nach dem ersten Termin am{' '}
        {startDate.split('-').reverse().join('.')}. Liegt der in der letzten
        Woche des Monats, gilt „am letzten“ — sonst fiele der Termin in kürzeren
        Monaten aus.
      </p>
    )}

    {value.mode !== 'NONE' && (
      <div className="field field--wide">
        <label htmlFor="appointment-ends">Endet</label>
        <div className="row-actions">
          <select
            id="appointment-ends"
            value={value.ends}
            onChange={(event) =>
              onChange({
                ...value,
                ends: event.target.value as RecurrenceForm['ends'],
              })
            }
          >
            <option value="NEVER">nie</option>
            <option value="UNTIL">an einem Tag</option>
            <option value="COUNT">nach einer Anzahl</option>
          </select>

          {value.ends === 'UNTIL' && (
            <input
              aria-label="Letzter Tag"
              type="date"
              value={value.until}
              onChange={(event) =>
                onChange({ ...value, until: event.target.value })
              }
            />
          )}

          {value.ends === 'COUNT' && (
            <>
              <input
                aria-label="Anzahl"
                className="input--narrow"
                type="number"
                min={1}
                max={750}
                value={value.count}
                onChange={(event) =>
                  onChange({
                    ...value,
                    count: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
              <span className="field__hint">Mal</span>
            </>
          )}
        </div>
      </div>
    )}
  </>
);
