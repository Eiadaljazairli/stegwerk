import { useAuth } from '../lib/auth';
import { hinweisText, type LiveObjekt } from '../lib/live';
import { useFremdeAenderung } from '../lib/useLive';

export const LiveHinweis = ({
  objekt,
  id,
}: {
  objekt: LiveObjekt;
  id: string;
}) => {
  const { session } = useAuth();
  const [aenderung, schliessen] = useFremdeAenderung(objekt, id);

  return (
    <div className="live-hinweis__bereich" role="status" aria-live="polite">
      {aenderung !== null && (
        <div className="live-hinweis">
          <span className="live-hinweis__punkt" aria-hidden="true" />
          <span>{hinweisText(aenderung, session?.user.id ?? null)}</span>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={schliessen}
          >
            Ausblenden
          </button>
        </div>
      )}
    </div>
  );
};
