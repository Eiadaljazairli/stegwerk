import { type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { IconHelp } from './Icons';
import { type ObjectKind } from './ObjectTile';

export const ObjectHeader = ({
  label,
  title,
  anzahl,
  note,
  actions,
  hilfe,
}: {
  kind: ObjectKind;
  icon: ComponentType<{ size?: number }>;
  label: string;
  title?: ReactNode;
  anzahl?: number;
  note?: ReactNode;
  actions?: ReactNode;
  hilfe?: string;
}) => {
  const eigenerTitel = title !== undefined && anzahl === undefined;

  return (
    <header className="object-header">
      <div className="object-header__text">
        {eigenerTitel && <div className="object-header__kind">{label}</div>}
        <div className="object-header__titelzeile">
          <h1>
            {eigenerTitel ? title : label}
            {anzahl !== undefined && ' '}
            {anzahl !== undefined && (
              <span className="object-header__anzahl">{String(anzahl)}</span>
            )}
          </h1>
          {hilfe !== undefined && (
            <Link
              to={`/hilfe#${hilfe}`}
              className="hilfe-link"
              aria-label={`Hilfe zu ${label}`}
              title={`Hilfe zu ${label}`}
            >
              <IconHelp size={16} />
            </Link>
          )}
        </div>
        {note !== undefined && (
          <div className="object-header__note">{note}</div>
        )}
      </div>

      {actions !== undefined && (
        <div className="object-header__actions">{actions}</div>
      )}
    </header>
  );
};
