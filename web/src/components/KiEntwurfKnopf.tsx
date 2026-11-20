import { useMutation } from '@apollo/client';
import { useId, useState } from 'react';

import { anbieterName, type KiBezug } from '../lib/ki';
import { KI_ENTWURF } from '../lib/queries';
import { useKi } from '../lib/useKi';
import { Dialogfenster } from './Dialogfenster';
import { IconSuggestions } from './Icons';

export const KiEntwurfKnopf = ({
  art,
  bezug,
  bisher,
  betreff,
  empfaenger,
  titel,
  onUebernehmen,
}: {
  art: 'mail' | 'angebot_einleitung' | 'angebot_schluss';
  bezug: KiBezug | null;
  bisher?: string;
  betreff?: string;
  empfaenger?: string;
  titel: string;
  onUebernehmen: (text: string) => void | Promise<unknown>;
}) => {
  const { einstellung, nutzbar } = useKi();
  const [offen, setOffen] = useState(false);
  const [anweisung, setAnweisung] = useState('');
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erstellen, { loading }] = useMutation<{ kiEntwurf: string }>(
    KI_ENTWURF,
  );
  const feldId = useId();

  if (!nutzbar || einstellung === null) {
    return null;
  }

  const schliessen = () => {
    setOffen(false);
    setEntwurf(null);
    setFehler(null);
  };

  const los = async () => {
    setFehler(null);

    try {
      const ergebnis = await erstellen({
        variables: {
          input: {
            art,
            anweisung: anweisung.trim(),
            bisher:
              bisher !== undefined && bisher.trim() !== '' ? bisher : null,
            betreff: betreff?.trim() || null,
            empfaenger: empfaenger?.trim() || null,
            bezug,
          },
        },
      });

      setEntwurf(ergebnis.data?.kiEntwurf ?? '');
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');
    }
  };

  return (
    <>
      <button
        type="button"
        className="button button--quiet ki-entwurf__knopf"
        onClick={() => setOffen(true)}
      >
        <IconSuggestions size={15} />
        Entwurf mit KI
      </button>

      {offen && (
        <Dialogfenster titel={`${titel}: Entwurf mit KI`} onClose={schliessen}>
          <form
            className="ki-entwurf"
            onSubmit={(event) => {
              event.preventDefault();
              void los();
            }}
          >
            <div className="field">
              <label htmlFor={feldId}>Was soll drinstehen?</label>
              <textarea
                id={feldId}
                rows={3}
                maxLength={2000}
                value={anweisung}
                placeholder={
                  art === 'mail'
                    ? 'Etwa: freundlich nachfassen, ob das Angebot angekommen ist'
                    : 'Etwa: Bezug auf das Gespräch vom Dienstag, Termin im Mai'
                }
                aria-describedby={`${feldId}-hinweis`}
                onChange={(event) => setAnweisung(event.target.value)}
              />
              <p id={`${feldId}-hinweis`} className="field__hint">
                {bisher !== undefined && bisher.trim() !== ''
                  ? 'Der Text im Feld wird überarbeitet. '
                  : ''}
                Die KI liest dazu, was Sie selbst sehen dürfen, und schickt es
                an {anbieterName(einstellung.anbieter)} unter dem Vertrag Ihres
                Bereichs. Ins Feld kommt der Entwurf erst mit „Übernehmen“.
              </p>
            </div>

            {fehler !== null && (
              <div className="error-banner" role="alert">
                {fehler}
              </div>
            )}

            <div className="ki-entwurf__aktionen">
              <button
                type="submit"
                className="button button--ghost"
                disabled={loading}
              >
                {loading
                  ? 'Wird geschrieben …'
                  : entwurf === null
                    ? 'Entwurf erstellen'
                    : 'Neu erstellen'}
              </button>
            </div>

            <div aria-live="polite">
              {entwurf !== null && (
                <section className="ki-entwurf__vorschau">
                  <h3>Entwurf</h3>
                  <p className="ki-entwurf__text">{entwurf}</p>
                </section>
              )}
            </div>

            <div className="ki-entwurf__aktionen">
              <button
                type="button"
                className="button button--ghost"
                onClick={schliessen}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={entwurf === null || entwurf.trim() === ''}
                onClick={() => {
                  const text = entwurf ?? '';

                  schliessen();
                  void Promise.resolve(onUebernehmen(text));
                }}
              >
                Übernehmen
              </button>
            </div>
          </form>
        </Dialogfenster>
      )}
    </>
  );
};
