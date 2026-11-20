import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Wordmark } from '../components/Wordmark';
import { API_ROOT } from '../lib/download';

type Angaben = { email: string; thema: string; absender: string };

export const AbmeldenPage = () => {
  const { token = '' } = useParams();
  const [angaben, setAngaben] = useState<Angaben | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<'thema' | 'alles' | null>(null);
  const [sendet, setSendet] = useState(false);
  const pfad = `${API_ROOT}/public/abmelden/${encodeURIComponent(token)}`;

  useEffect(() => {
    void fetch(pfad)
      .then(async (antwort) => {
        if (!antwort.ok) {
          throw new Error('Dieser Abmeldelink ist ungültig.');
        }

        setAngaben((await antwort.json()) as Angaben);
      })
      .catch((problem: unknown) =>
        setFehler(
          problem instanceof Error ? problem.message : 'Fehlgeschlagen.',
        ),
      );
  }, [pfad]);

  const abmelden = (alles: boolean) => {
    setSendet(true);
    setFehler(null);
    void fetch(pfad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alles }),
    })
      .then((antwort) => {
        if (!antwort.ok) {
          throw new Error('Das hat nicht geklappt. Bitte später erneut.');
        }

        setErledigt(alles ? 'alles' : 'thema');
      })
      .catch((problem: unknown) =>
        setFehler(
          problem instanceof Error ? problem.message : 'Fehlgeschlagen.',
        ),
      )
      .finally(() => setSendet(false));
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Wordmark size={16} />
        </div>
        <div className="auth__title">Abmelden</div>

        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
          </div>
        )}

        {erledigt !== null ? (
          <p>
            Erledigt. {angaben?.email} bekommt{' '}
            {erledigt === 'alles'
              ? 'keine Serienmails mehr'
              : `keine Serienmails zum Thema „${angaben?.thema ?? ''}“ mehr`}
            {angaben?.absender ? ` von ${angaben.absender}` : ''}. Persönliche
            Nachrichten können Sie weiterhin erhalten.
          </p>
        ) : angaben !== null ? (
          <>
            <p>
              {angaben.email} von Serienmails
              {angaben.absender ? ` von ${angaben.absender}` : ''} abmelden?
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="button"
                disabled={sendet}
                onClick={() => abmelden(false)}
              >
                Vom Thema „{angaben.thema}“ abmelden
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={sendet}
                onClick={() => abmelden(true)}
              >
                Von allen abmelden
              </button>
            </div>
          </>
        ) : (
          fehler === null && <p className="auth__subtitle">Wird geladen…</p>
        )}
      </div>
    </div>
  );
};
