import { useMutation, useQuery } from '@apollo/client';

import { AUTOMATION_KNOEPFE, AUTOMATION_STARTEN } from '../lib/queries';
import { useToast } from './Toast';

type Knopf = { id: string; name: string };

type Lauf = { id: string; status: string; grund: string | null };

const ERGEBNIS: Record<string, string> = {
  OK: 'erledigt',
  UEBERSPRUNGEN: 'übersprungen',
  FEHLER: 'mit Fehler beendet',
  GEPLANT: 'vorgemerkt',
  LAEUFT: 'läuft',
  ABGEBROCHEN: 'abgebrochen',
};

export const AutomationKnoepfe = ({
  art,
  zielId,
}: {
  art: 'deal' | 'contact' | 'company';
  zielId: string;
}) => {
  const toast = useToast();
  const { data } = useQuery<{ automationKnoepfe: Knopf[] }>(
    AUTOMATION_KNOEPFE,
    { variables: { art } },
  );
  const [starten, start] = useMutation<{ automationStarten: Lauf }>(
    AUTOMATION_STARTEN,
    { refetchQueries: 'active' },
  );

  const knoepfe = data?.automationKnoepfe ?? [];

  if (knoepfe.length === 0) {
    return null;
  }

  return (
    <>
      {knoepfe.map((knopf) => (
        <button
          key={knopf.id}
          type="button"
          className="button button--ghost"
          disabled={start.loading}
          onClick={() => {
            if (!window.confirm(`„${knopf.name}“ jetzt ausführen?`)) {
              return;
            }

            void starten({ variables: { id: knopf.id, zielId } })
              .then((antwort) => {
                const lauf = antwort.data?.automationStarten;

                toast.zeige({
                  text:
                    lauf === undefined
                      ? `„${knopf.name}“ ausgeführt.`
                      : `„${knopf.name}“: ${ERGEBNIS[lauf.status] ?? lauf.status}${
                          lauf.grund === null ? '' : ` — ${lauf.grund}`
                        }`,
                });
              })
              .catch((fehler: Error) => toast.zeige({ text: fehler.message }));
          }}
        >
          {knopf.name}
        </button>
      ))}
    </>
  );
};
