import { type ReactNode, useState } from 'react';

import { IconFilter } from './Icons';

export const Werkzeugleiste = ({ children }: { children: ReactNode }) => {
  const [offen, setOffen] = useState(false);

  return (
    <div className={offen ? 'toolbar is-offen' : 'toolbar'}>
      {children}
      <button
        type="button"
        className="button button--ghost toolbar__aufklappen"
        aria-expanded={offen}
        onClick={() => setOffen((jetzt) => !jetzt)}
      >
        <IconFilter size={14} />
        Filter
      </button>
    </div>
  );
};
