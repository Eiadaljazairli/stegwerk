import { useQuery } from '@apollo/client';

import { ABMELDUNGEN } from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

export const AbmeldeHinweis = ({ email }: { email: string | null }) => {
  const { can } = usePermissions();
  const darf = can('workspace:campaigns') && email !== null && email !== '';
  const { data } = useQuery<{
    abmeldungen: { id: string; email: string; thema: string }[];
  }>(ABMELDUNGEN, { variables: { suche: email }, skip: !darf });

  const themen = (data?.abmeldungen ?? [])
    .filter((a) => a.email === email?.toLowerCase())
    .map((a) => (a.thema === 'alle' ? 'alle Serienmails' : a.thema));

  if (!darf || themen.length === 0) {
    return null;
  }

  return (
    <div className="notice" role="note">
      Von Serienmails abgemeldet: {themen.join(', ')}.
    </div>
  );
};
