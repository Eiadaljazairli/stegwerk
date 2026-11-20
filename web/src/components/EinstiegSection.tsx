import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  BEISPIELDATEN,
  BEISPIELDATEN_ENTFERNEN,
  BEISPIELDATEN_LADEN,
  BRANCHENVORLAGE_ANWENDEN,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

const VORLAGEN = [
  { schluessel: 'handwerk', name: 'Handwerk' },
  { schluessel: 'agentur', name: 'Agentur' },
  { schluessel: 'grosshandel', name: 'Großhandel' },
];

export const EinstiegSection = () => {
  const rechte = usePermissions();
  const toast = useToast();
  const darf = rechte.can('workspace:fields');
  const { data } = useQuery<{ beispieldaten: number }>(BEISPIELDATEN, {
    skip: !darf,
    fetchPolicy: 'cache-and-network',
  });
  const nachher = {
    refetchQueries: 'active' as const,
    awaitRefetchQueries: true,
  };
  const [laden, ladenStand] = useMutation(BEISPIELDATEN_LADEN, nachher);
  const [entfernen, entfernenStand] = useMutation(
    BEISPIELDATEN_ENTFERNEN,
    nachher,
  );
  const [anwenden, anwendenStand] = useMutation(
    BRANCHENVORLAGE_ANWENDEN,
    nachher,
  );
  const [vorlage, setVorlage] = useState('');
  const [fragen, setFragen] = useState<'entfernen' | 'vorlage' | null>(null);

  if (!darf) {
    return null;
  }

  const anzahl = data?.beispieldaten ?? 0;
  const fehler =
    ladenStand.error ?? entfernenStand.error ?? anwendenStand.error;
  const beschaeftigt =
    ladenStand.loading || entfernenStand.loading || anwendenStand.loading;
  const vorlageName = VORLAGEN.find((v) => v.schluessel === vorlage)?.name;

  return (
    <section className="card konto" id="beispieldaten">
      <h2>Beispieldaten und Branchenvorlage</h2>
      <p className="field__hint">
        Erfundene Firmen, Kontakte und Geschäfte zum Ausprobieren, jeweils mit
        der Herkunft „als Beispiel“ gekennzeichnet. Sie lassen sich mit einem
        Klick wieder entfernen; Ihre eigenen Daten bleiben dabei unberührt.
      </p>
      {fehler !== undefined && (
        <div className="error-banner">{fehler.message}</div>
      )}
      <div className="form-actions">
        {anzahl === 0 ? (
          <button
            type="button"
            className="button"
            disabled={beschaeftigt || data === undefined}
            onClick={() =>
              void laden()
                .then(() => toast.zeige({ text: 'Beispieldaten geladen.' }))
                .catch(() => null)
            }
          >
            Beispieldaten laden
          </button>
        ) : (
          <button
            type="button"
            className="button button--danger"
            disabled={beschaeftigt}
            onClick={() => setFragen('entfernen')}
          >
            {`Beispieldaten entfernen (${String(anzahl)})`}
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor="branchenvorlage">Branchenvorlage</label>
        <select
          id="branchenvorlage"
          value={vorlage}
          disabled={beschaeftigt}
          onChange={(event) => setVorlage(event.target.value)}
        >
          <option value="">Keine</option>
          {VORLAGEN.map((v) => (
            <option key={v.schluessel} value={v.schluessel}>
              {v.name}
            </option>
          ))}
        </select>
        <span className="field__hint">
          Benennt die Phasen der Standard-Pipeline so, wie die Branche sie
          nennt, und legt ein paar übliche eigene Felder an.
        </span>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="button button--ghost"
          disabled={beschaeftigt || vorlage === ''}
          onClick={() => setFragen('vorlage')}
        >
          Vorlage anwenden
        </button>
      </div>

      {fragen === 'entfernen' && (
        <ConfirmDialog
          title="Beispieldaten entfernen?"
          consequence="Die Beispiel-Firmen, -Kontakte und -Geschäfte werden gelöscht, mit allen Notizen, Aufgaben und Terminen daran. Eigene Datensätze, die auf ein Beispiel verweisen, bleiben und verlieren nur diesen Verweis."
          confirmLabel="Entfernen"
          onCancel={() => setFragen(null)}
          onConfirm={() => {
            setFragen(null);
            void entfernen()
              .then(() => toast.zeige({ text: 'Beispieldaten entfernt.' }))
              .catch(() => null);
          }}
        />
      )}
      {fragen === 'vorlage' && vorlageName !== undefined && (
        <ConfirmDialog
          title={`Vorlage „${vorlageName}“ anwenden?`}
          consequence="Die Namen der Phasen in der Standard-Pipeline werden ersetzt. Eigene Felder kommen hinzu, soweit es noch keines mit gleichem Namen gibt; vorhandene Felder und Daten bleiben."
          confirmLabel="Anwenden"
          onCancel={() => setFragen(null)}
          onConfirm={() => {
            setFragen(null);
            void anwenden({ variables: { vorlage } })
              .then(({ data: antwort }) => {
                const neu = (antwort as { branchenvorlageAnwenden: number })
                  .branchenvorlageAnwenden;

                toast.zeige({
                  text: `Vorlage angewendet, ${String(neu)} neue Felder.`,
                });
              })
              .catch(() => null);
          }}
        />
      )}
    </section>
  );
};
