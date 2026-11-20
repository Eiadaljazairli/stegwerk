import { type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { nachbarnVon } from '../lib/blaettern';
import { type LiveObjekt } from '../lib/live';

import { type ObjectKind, ObjectTile } from './ObjectTile';
import { IconArrowLeft, IconChevronLeft, IconChevronRight } from './Icons';
import { LiveHinweis } from './LiveHinweis';

export type Highlight = {
  label: string;
  value: ReactNode;
  numeric?: boolean;
};

export const Highlights = ({
  kind,
  icon,
  label,
  title,
  back,
  fields,
  actions,
  blaettern,
  bild,
  live,
}: {
  kind: ObjectKind;
  icon: ComponentType<{ size?: number }>;
  label: string;
  title: string;
  back: { to: string; label: string };
  fields: Highlight[];
  actions?: ReactNode;
  blaettern?: { art: string; id: string; basis: string };
  bild?: ReactNode;
  live?: { objekt: LiveObjekt; id: string };
}) => {
  const nachbarn =
    blaettern === undefined ? null : nachbarnVon(blaettern.art, blaettern.id);

  return (
    <header className="highlights">
      <div className="highlights__kopfzeile">
        <Link className="highlights__back" to={back.to}>
          <IconArrowLeft size={14} /> {back.label}
        </Link>

        {nachbarn !== null && blaettern !== undefined && (
          <nav className="highlights__blaettern" aria-label="Blättern">
            {nachbarn.vorher === null ? (
              <span
                className="button button--ghost button--small"
                aria-disabled="true"
              >
                <IconChevronLeft size={14} />
              </span>
            ) : (
              <Link
                className="button button--ghost button--small"
                to={`${blaettern.basis}/${nachbarn.vorher}`}
                aria-label="Vorheriger Eintrag"
                title="Vorheriger Eintrag"
              >
                <IconChevronLeft size={14} />
              </Link>
            )}
            <span className="highlights__position">
              {nachbarn.position} von {nachbarn.anzahl}
            </span>
            {nachbarn.nachher === null ? (
              <span
                className="button button--ghost button--small"
                aria-disabled="true"
              >
                <IconChevronRight size={14} />
              </span>
            ) : (
              <Link
                className="button button--ghost button--small"
                to={`${blaettern.basis}/${nachbarn.nachher}`}
                aria-label="Nächster Eintrag"
                title="Nächster Eintrag"
              >
                <IconChevronRight size={14} />
              </Link>
            )}
          </nav>
        )}
      </div>

      <div className="highlights__top">
        {bild ?? <ObjectTile kind={kind} icon={icon} size="lg" />}

        <div className="highlights__identity">
          <div className="highlights__kind">{label}</div>
          <h1 className="highlights__title">{title}</h1>
        </div>

        {actions !== undefined && (
          <div className="highlights__actions">{actions}</div>
        )}
      </div>

      {fields.length > 0 && (
        <dl className="highlights__fields">
          {fields.map((field) => (
            <div key={field.label} className="highlights__field">
              <dt>{field.label}</dt>
              <dd className={field.numeric === true ? 'numeric' : undefined}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {live !== undefined && <LiveHinweis objekt={live.objekt} id={live.id} />}
    </header>
  );
};
