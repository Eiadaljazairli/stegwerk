import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { KI_VORSCHLAEGE_FUER } from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

export const KiVorschlagHinweis = ({
  art,
  id,
}: {
  art: 'company' | 'contact' | 'deal' | 'quote';
  id: string;
}) => {
  const rechte = usePermissions();
  const { data } = useQuery<{
    kiVorschlaegeFuer: { id: string; zusammenfassung: string }[];
  }>(KI_VORSCHLAEGE_FUER, {
    variables: { art, id },
    skip: !rechte.can('workspace:ki'),
    fetchPolicy: 'cache-and-network',
  });
  const offen = data?.kiVorschlaegeFuer ?? [];

  if (offen.length === 0) {
    return null;
  }

  return (
    <div className="banner ki-hinweis" role="status">
      {offen.length === 1
        ? `Ein KI-Assistent schlägt hier etwas vor: „${offen[0].zusammenfassung}“.`
        : `Ein KI-Assistent schlägt hier ${String(offen.length)} Änderungen vor.`}{' '}
      <Link to="/ki-vorschlaege">Prüfen</Link>
    </div>
  );
};
