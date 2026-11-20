import { type ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="card empty">
    <div className="empty__title">{title}</div>
    <p className="empty__description">{description}</p>
    {action !== undefined && <div className="empty__actions">{action}</div>}
  </div>
);
