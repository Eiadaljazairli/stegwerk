import { useMutation, useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { FAVORIT_UMSCHALTEN, MEINE_FAVORITEN } from '../lib/queries';
import { IconStar } from './Icons';
import { useToast } from './Toast';
import { useBezeichnung } from '../lib/useBezeichnung';

export type FavoritArt = 'FIRMA' | 'KONTAKT' | 'GESCHAEFT';

export type Favorit = {
  art: FavoritArt;
  datensatzId: string;
  titel: string;
  createdAt: string;
};

const PFAD: Record<FavoritArt, string> = {
  FIRMA: 'firmen',
  KONTAKT: 'kontakte',
  GESCHAEFT: 'geschaefte',
};

export const ART_NAME: Record<FavoritArt, string> = {
  FIRMA: 'Firma',
  KONTAKT: 'Kontakt',
  GESCHAEFT: 'Geschäft',
};

export const favoritPfad = (favorit: Pick<Favorit, 'art' | 'datensatzId'>) =>
  `/${PFAD[favorit.art]}/${favorit.datensatzId}`;

export const useFavoriten = (skip = false): Favorit[] => {
  const { data } = useQuery<{ meineFavoriten: Favorit[] }>(MEINE_FAVORITEN, {
    skip,
  });

  return data?.meineFavoriten ?? [];
};

export const FavoritStern = ({
  art,
  datensatzId,
}: {
  art: FavoritArt;
  datensatzId: string;
}) => {
  const favoriten = useFavoriten();
  const toast = useToast();
  const [umschalten, { loading }] = useMutation(FAVORIT_UMSCHALTEN, {
    refetchQueries: [MEINE_FAVORITEN],
    awaitRefetchQueries: true,
  });

  const gesetzt = favoriten.some(
    (f) => f.art === art && f.datensatzId === datensatzId,
  );
  const text = gesetzt ? 'Aus den Favoriten nehmen' : 'Zu den Favoriten';

  return (
    <button
      type="button"
      className={
        gesetzt
          ? 'button button--ghost favorit-stern is-active'
          : 'button button--ghost favorit-stern'
      }
      aria-pressed={gesetzt}
      aria-label={text}
      title={text}
      disabled={loading}
      onClick={() =>
        void umschalten({ variables: { art, datensatzId } }).catch(
          (fehler: Error) => toast.zeige({ text: fehler.message }),
        )
      }
    >
      <IconStar filled={gesetzt} />
    </button>
  );
};

export const FavoritenKarte = () => {
  const favoriten = useFavoriten();
  const bez = useBezeichnung();

  if (favoriten.length === 0) {
    return null;
  }

  return (
    <section className="card favoriten-karte" aria-labelledby="favoriten-titel">
      <h2 id="favoriten-titel" className="favoriten-karte__titel">
        <IconStar filled /> Favoriten
      </h2>
      <ul className="favoriten-karte__liste">
        {favoriten.slice(0, 10).map((favorit) => (
          <li key={`${favorit.art}-${favorit.datensatzId}`}>
            <Link to={favoritPfad(favorit)}>{favorit.titel}</Link>
            <span className="favoriten-karte__art">{bez(favorit.art)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
