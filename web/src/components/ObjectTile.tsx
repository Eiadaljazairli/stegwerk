import { type ComponentType, type CSSProperties } from 'react';

export type ObjectKind =
  | 'overview'
  | 'task'
  | 'deal'
  | 'quote'
  | 'invoice'
  | 'company'
  | 'contact'
  | 'product'
  | 'field'
  | 'team'
  | 'billing'
  | 'data'
  | 'letterhead'
  | 'mailbox'
  | 'import';

export const ObjectTile = ({
  kind,
  icon: Icon,
  size = 'md',
}: {
  kind: ObjectKind;
  icon: ComponentType<{ size?: number }>;
  size?: 'sm' | 'md' | 'lg';
}) => (
  <span
    className={`object-tile object-tile--${size}`}
    style={{ '--obj-farbe': `var(--obj-${kind})` } as CSSProperties}
    aria-hidden="true"
  >
    <Icon size={size === 'lg' ? 22 : size === 'md' ? 17 : 13} />
  </span>
);
