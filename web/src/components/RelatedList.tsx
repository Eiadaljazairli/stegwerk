import { type ComponentType, type ReactNode } from 'react';

import { type ObjectKind, ObjectTile } from './ObjectTile';

export const RelatedList = ({
  kind,
  icon,
  title,
  count,
  action,
  empty,
  children,
}: {
  kind: ObjectKind;
  icon: ComponentType<{ size?: number }>;
  title: string;
  count: number;
  action?: ReactNode;
  empty: string;
  children?: ReactNode;
}) => (
  <section className="related">
    <header className="related__head">
      <ObjectTile kind={kind} icon={icon} size="md" />

      <h2 className="related__title">
        {title}
        <span className="related__count">{count}</span>
      </h2>

      {action !== undefined && <div className="related__action">{action}</div>}
    </header>

    {count === 0 ? (
      <p className="related__empty">{empty}</p>
    ) : (
      <div className="related__body">{children}</div>
    )}
  </section>
);
