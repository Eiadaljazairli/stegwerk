import { Link } from 'react-router-dom';

import { abhilfeFuer, abhilfePfad, type FehlerId } from '../lib/fehlerbehebung';

export const AbhilfeLink = ({
  id,
  meldung,
}: {
  id?: FehlerId;
  meldung?: string | null;
}) => {
  const ziel = id ?? abhilfeFuer(meldung);

  if (ziel === null) {
    return null;
  }

  return (
    <>
      {' '}
      <Link to={abhilfePfad(ziel)} className="abhilfe-link">
        So beheben Sie das
      </Link>
    </>
  );
};
