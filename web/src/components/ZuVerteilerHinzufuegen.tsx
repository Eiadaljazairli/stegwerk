import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  VERTEILER_ANLEGEN,
  VERTEILER_HINZUFUEGEN,
  VERTEILER_LISTE,
} from '../lib/queries';
import { type Verteiler } from '../lib/types';
import { useToast } from './Toast';

const NEU = '__neu__';

export const ZuVerteilerHinzufuegen = ({
  kontaktIds,
  onFertig,
}: {
  kontaktIds: string[];
  onFertig: () => void;
}): JSX.Element => {
  const { zeige } = useToast();
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState('');
  const [name, setName] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const { data } = useQuery<{ verteilerListe: Verteiler[] }>(VERTEILER_LISTE, {
    skip: !offen,
  });
  const [anlegen, { loading: legtAn }] = useMutation<{
    verteilerAnlegen: Verteiler;
  }>(VERTEILER_ANLEGEN);
  const [hinzufuegen, { loading: fuegtHinzu }] = useMutation<{
    verteilerMitgliederHinzufuegen: Verteiler;
  }>(VERTEILER_HINZUFUEGEN, { refetchQueries: [VERTEILER_LISTE] });
  const liste = data?.verteilerListe ?? [];
  const ziel = wahl === '' ? (liste[0]?.id ?? NEU) : wahl;

  const absenden = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFehler(null);

    try {
      const id =
        ziel === NEU
          ? (await anlegen({ variables: { input: { name } } })).data
              ?.verteilerAnlegen.id
          : ziel;

      if (id === undefined) {
        return;
      }

      const antwort = await hinzufuegen({
        variables: { id, kontaktIds },
      });
      const verteiler = antwort.data?.verteilerMitgliederHinzufuegen;

      zeige({
        text:
          verteiler === undefined
            ? 'Hinzugefügt.'
            : `Im Verteiler „${verteiler.name}“ stehen jetzt ${String(verteiler.anzahl)} Kontakte.`,
      });
      setOffen(false);
      setName('');
      onFertig();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Nicht hinzugefügt.',
      );
    }
  };

  return (
    <div className="verteiler-sammel">
      <button
        type="button"
        className="button button--ghost"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        Zu Verteiler hinzufügen
      </button>

      {offen && (
        <form
          className="verteiler-sammel__panel"
          aria-label="Zu Verteiler hinzufügen"
          onSubmit={(event) => void absenden(event)}
        >
          <div className="field">
            <label htmlFor="verteiler-sammel-wahl">Verteiler</label>
            <select
              id="verteiler-sammel-wahl"
              value={ziel}
              onChange={(event) => setWahl(event.target.value)}
            >
              {liste.map((verteiler) => (
                <option key={verteiler.id} value={verteiler.id}>
                  {verteiler.name} ({verteiler.anzahl})
                </option>
              ))}
              <option value={NEU}>Neuer Verteiler …</option>
            </select>
          </div>
          {ziel === NEU && (
            <div className="field">
              <label htmlFor="verteiler-sammel-name">Name</label>
              <input
                id="verteiler-sammel-name"
                required
                maxLength={120}
                placeholder="z. B. Weihnachtskarte 2026"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
            </div>
          )}
          <div className="row-actions">
            <button
              type="submit"
              className="button"
              disabled={legtAn || fuegtHinzu}
            >
              {kontaktIds.length === 1
                ? '1 Kontakt hinzufügen'
                : `${String(kontaktIds.length)} Kontakte hinzufügen`}
            </button>
            <Link className="button button--ghost" to="/verteiler">
              Alle Verteiler
            </Link>
          </div>
        </form>
      )}
    </div>
  );
};
