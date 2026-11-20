import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import {
  ADD_MAIL_SPERRE,
  MAIL_SPERREN,
  REMOVE_MAIL_SPERRE,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

type Sperre = { id: string; eintrag: string; createdAt: string };

export const MailSperrenSection = () => {
  const permissions = usePermissions();
  const darfAendern = permissions.can('workspace:members');
  const refetchQueries = [{ query: MAIL_SPERREN }];
  const { data } = useQuery<{ mailSperren: Sperre[] }>(MAIL_SPERREN);
  const [hinzufuegen, { loading }] = useMutation(ADD_MAIL_SPERRE, {
    refetchQueries,
  });
  const [entfernen] = useMutation(REMOVE_MAIL_SPERRE, { refetchQueries });
  const [eintrag, setEintrag] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const sperren = data?.mailSperren ?? [];

  const absenden = async (ereignis: FormEvent): Promise<void> => {
    ereignis.preventDefault();
    setFehler(null);

    try {
      await hinzufuegen({ variables: { input: { eintrag } } });
      setEintrag('');
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Fehler.');
    }
  };

  const loeschen = async (id: string): Promise<void> => {
    setFehler(null);

    try {
      await entfernen({ variables: { id } });
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Fehler.');
    }
  };

  return (
    <section className="card mail-sperren">
      <h2>Sperrliste</h2>
      <p className="field__hint">
        Post von und an diese Adressen wird beim Abruf übergangen und nicht
        gespeichert — für alle Postfächer dieses Arbeitsbereichs. Eine ganze
        Domain sperren Sie mit @ davor, etwa @newsletter.de. Was schon abgerufen
        wurde, bleibt.
      </p>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {sperren.length === 0 ? (
        <p className="field__hint">Noch nichts gesperrt.</p>
      ) : (
        <ul className="mail-sperren__liste">
          {sperren.map((sperre) => (
            <li key={sperre.id}>
              <code>{sperre.eintrag}</code>
              {darfAendern && (
                <button
                  type="button"
                  className="button button--quiet"
                  aria-label={`${sperre.eintrag} von der Sperrliste nehmen`}
                  onClick={() => void loeschen(sperre.id)}
                >
                  Entfernen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {darfAendern ? (
        <form className="mail-sperren__form" onSubmit={absenden}>
          <div className="field">
            <label htmlFor="mail-sperre">Adresse oder @domain</label>
            <input
              id="mail-sperre"
              value={eintrag}
              placeholder="info@newsletter.de oder @newsletter.de"
              onChange={(ereignis) => {
                setEintrag(ereignis.target.value);
              }}
            />
          </div>
          <button
            type="submit"
            className="button button--ghost"
            disabled={loading || eintrag.trim() === ''}
          >
            Sperren
          </button>
        </form>
      ) : (
        <p className="field__hint">
          Ändern kann die Liste, wer das Team verwaltet.
        </p>
      )}
    </section>
  );
};
