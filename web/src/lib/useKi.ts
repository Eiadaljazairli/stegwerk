import { useQuery } from '@apollo/client';

import { KI_EINSTELLUNG } from './queries';
import { usePermissions } from './usePermissions';

export type KiEinstellung = {
  id: string;
  anbieter: string;
  modell: string;
  nutzung: string;
  geprueftAm: string | null;
  createdAt: string;
  updatedAt: string;
};

export const useKi = () => {
  const { can } = usePermissions();
  const { data, loading } = useQuery<{ kiEinstellung: KiEinstellung | null }>(
    KI_EINSTELLUNG,
    { errorPolicy: 'ignore' },
  );
  const einstellung = data?.kiEinstellung ?? null;

  return {
    loading,
    einstellung,
    nutzbar:
      einstellung !== null &&
      (einstellung.nutzung !== 'ki_recht' || can('workspace:ki')),
  };
};
