import { useQuery } from '@apollo/client';

import {
  type EinstellungsGruppe,
  sichtbareEinstellungen,
} from './einstellungen';
import { ENTITLEMENT } from './queries';
import { usePermissions } from './usePermissions';

export const useEinstellungen = (): EinstellungsGruppe[] => {
  const rechte = usePermissions();
  const { data } = useQuery<{
    entitlement: { billingConfigured: boolean };
  }>(ENTITLEMENT);

  return sichtbareEinstellungen(
    rechte.can,
    data?.entitlement.billingConfigured === true,
  );
};
