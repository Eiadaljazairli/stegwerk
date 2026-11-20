import { useQuery } from '@apollo/client';
import { type ReactNode } from 'react';

import { TwoFactorSection } from './TwoFactorSection';
import { ZWEI_FAKTOR_VERLANGT } from '../lib/queries';

export const ZweiFaktorSperre = ({ children }: { children: ReactNode }) => {
  const { data, refetch, client } = useQuery<{ zweiFaktorVerlangt: boolean }>(
    ZWEI_FAKTOR_VERLANGT,
  );

  if (data?.zweiFaktorVerlangt !== true) {
    return <>{children}</>;
  }

  return (
    <div className="zwei-faktor-sperre">
      <h1>Zwei-Faktor-Anmeldung einrichten</h1>
      <p>
        Ihr Arbeitsbereich verlangt von allen Mitgliedern einen zweiten Faktor.
        Richten Sie ihn jetzt mit einer Authentifizierungs-App ein, danach geht
        es weiter wie gewohnt.
      </p>
      <TwoFactorSection
        onCodesNotiert={() => {
          void refetch().then(() => client.resetStore());
        }}
      />
    </div>
  );
};
