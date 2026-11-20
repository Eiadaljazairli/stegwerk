import { useEffect, useRef, useState } from 'react';

import { toggleColumn } from '../lib/columns';
import { type ListControls } from '../lib/useListControls';
import { IconColumns } from './Icons';

export type ColumnChoice = {
  key: string;
  label: string;
};

export const ColumnPicker = ({
  available,
  controls,
}: {
  available: ColumnChoice[];
  controls: ListControls;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', onDown);

    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const [anchor, ...optional] = available;
  const chosen =
    controls.columns.length === 0
      ? available.map((column) => column.key)
      : controls.columns;

  const isOn = (key: string) => chosen.includes(key);

  const toggle = (key: string) =>
    controls.setColumns(toggleColumn(available, controls.columns, key));

  const hidden = available.length - chosen.length;

  return (
    <div className="columns" ref={ref}>
      <button
        type="button"
        className="button button--ghost columns__toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconColumns size={15} />
        Spalten
        {hidden > 0 && <span className="columns__badge">{hidden}</span>}
      </button>

      {open && (
        <div className="menu-panel columns__panel" role="menu">
          <div className="menu-panel__heading">Angezeigte Spalten</div>

          <label className="columns__option is-fixed">
            <input type="checkbox" checked disabled />
            {anchor.label}
          </label>

          {optional.map((column) => (
            <label key={column.key} className="columns__option">
              <input
                type="checkbox"
                checked={isOn(column.key)}
                onChange={() => toggle(column.key)}
              />
              {column.label}
            </label>
          ))}

          <div className="menu-panel__sep" />
          <button
            type="button"
            className="menu-panel__item"
            onClick={() => controls.setColumns([])}
          >
            Alle anzeigen
          </button>
        </div>
      )}
    </div>
  );
};
