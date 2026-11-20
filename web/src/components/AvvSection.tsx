import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { downloadFromApi } from '../lib/download';
import { AVV_ANNEHMEN, AVV_STAND } from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

type Stand = {
  aktuell: boolean;
  geprueft: boolean;
  auftraggeber: string;
  annahme: {
    id: string;
    angenommenVon: string;
    angenommenAm: string;
    auftraggeber: string;
    fassung: string;
  } | null;
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

export const AvvSection = () => {
  const rechte = usePermissions();
  const { data, refetch } = useQuery<{ avvStand: Stand }>(AVV_STAND);
  const [annehmen, { loading, error }] = useMutation(AVV_ANNEHMEN);
  const [berechtigt, setBerechtigt] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);

  const stand = data?.avvStand;

  if (stand === undefined) {
    return null;
  }

  const annahme = stand.annahme;

  return (
    <section className="card konto">
      <h2>Auftragsverarbeitung (AVV)</h2>

      {annahme === null ? (
        <p>Noch nicht angenommen.</p>
      ) : (
        <p>
          Angenommen am {ZEIT.format(new Date(annahme.angenommenAm))} von{' '}
          {annahme.angenommenVon} für {annahme.auftraggeber}.
          {!stand.aktuell && (
            <strong> Der Vertragstext hat sich seitdem geändert.</strong>
          )}
        </p>
      )}

      <div className="row-actions">
        <Link className="button button--ghost" to="/auftragsverarbeitung">
          Vertrag lesen
        </Link>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            setLadeFehler(null);
            void downloadFromApi(
              '/legal/auftragsverarbeitung/bereich.pdf',
              'Auftragsverarbeitungsvertrag-Stegwerk.pdf',
            ).catch((problem: unknown) =>
              setLadeFehler(
                problem instanceof Error ? problem.message : 'Fehlgeschlagen.',
              ),
            );
          }}
        >
          Als PDF mit unseren Angaben
        </button>
      </div>
      {ladeFehler !== null && <div className="error-banner">{ladeFehler}</div>}

      {rechte.everything && !stand.aktuell && !stand.geprueft && (
        <p className="field__hint">
          Der Vertragstext ist noch als Entwurf markiert. Angenommen werden kann
          er, sobald der Betreiber die rechtliche Prüfung bestätigt hat.
        </p>
      )}

      {rechte.everything && !stand.aktuell && stand.geprueft && (
        <div className="avv__annahme">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={berechtigt}
              onChange={(event) => setBerechtigt(event.target.checked)}
            />
            Ich bin berechtigt, für {stand.auftraggeber} zu handeln, und nehme
            den Vertrag in der aktuellen Fassung an.
          </label>
          {error !== undefined && (
            <div className="error-banner">{error.message}</div>
          )}
          <button
            type="button"
            className="button"
            disabled={!berechtigt || loading}
            onClick={() =>
              void annehmen()
                .then(() => refetch())
                .catch(() => null)
            }
          >
            Vertrag annehmen
          </button>
          <p className="field__hint">
            Der Auftraggeber stammt aus dem Briefkopf. Stimmt er nicht, ändern
            Sie ihn zuerst unter <Link to="/briefkopf">Briefkopf</Link>.
          </p>
        </div>
      )}
    </section>
  );
};
