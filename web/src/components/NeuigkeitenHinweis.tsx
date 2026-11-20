import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { NEUIGKEITEN, ungelesen, zuletztGesehen } from '../lib/neuigkeiten';

export const NeuigkeitenHinweis = () => {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [anzahl, setAnzahl] = useState(0);

  useEffect(() => {
    if (userId === undefined) {
      return undefined;
    }

    const zaehlen = () =>
      setAnzahl(ungelesen(NEUIGKEITEN, zuletztGesehen(userId)));

    zaehlen();
    window.addEventListener('stegwerk:neuigkeiten', zaehlen);
    window.addEventListener('storage', zaehlen);

    return () => {
      window.removeEventListener('stegwerk:neuigkeiten', zaehlen);
      window.removeEventListener('storage', zaehlen);
    };
  }, [userId]);

  if (anzahl === 0) {
    return null;
  }

  return (
    <Link
      to="/neuigkeiten"
      className="neu-hinweis"
      title="Neu in Stegwerk"
      aria-label={`Neu in Stegwerk: ${String(anzahl)} ${anzahl === 1 ? 'Neuigkeit' : 'Neuigkeiten'}`}
    >
      <span className="neu-hinweis__punkt" aria-hidden="true" />
      Neu
    </Link>
  );
};
