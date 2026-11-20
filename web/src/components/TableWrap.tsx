import { type ReactNode } from 'react';

import { scrollAttribute, useUeberlauf } from '../lib/useUeberlauf';

export const TableWrap = ({
  children,
  label = 'Tabelle',
}: {
  children: ReactNode;
  label?: string;
}) => {
  const [ref, laeuftUeber] = useUeberlauf<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="table-wrap"
      {...scrollAttribute(laeuftUeber, label)}
    >
      {children}
    </div>
  );
};
