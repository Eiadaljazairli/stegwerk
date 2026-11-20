import { useQuery } from '@apollo/client';

import { MY_PERMISSIONS } from './queries';
import { type MyPermissions } from './types';

export const usePermissions = () => {
  const { data, loading } = useQuery<{ myPermissions: MyPermissions }>(
    MY_PERMISSIONS,
  );

  const mine = data?.myPermissions;

  return {
    loading,
    everything: mine?.everything ?? false,
    can: (permission: string): boolean =>
      mine !== undefined &&
      (mine.everything || mine.permissions.includes(permission)),
  };
};
