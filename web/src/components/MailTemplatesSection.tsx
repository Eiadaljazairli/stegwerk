import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { PLATZHALTER } from '../lib/mail-vorlage';
import {
  DELETE_MAIL_TEMPLATE,
  MAIL_TEMPLATES,
  SAVE_MAIL_TEMPLATE,
} from '../lib/queries';

export type MailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
};

export const MailTemplatesSection = () => {
  const { data } = useQuery<{ mailTemplates: MailTemplate[] }>(MAIL_TEMPLATES);
  const refetchQueries = [{ query: MAIL_TEMPLATES }];
  const [speichern, { loading }] = useMutation(SAVE_MAIL_TEMPLATE, {
    refetchQueries,
  });
  const [loeschen] = useMutation(DELETE_MAIL_TEMPLATE, { refetchQueries });

  const [bearbeitet, setBearbeitet] = useState<MailTemplate | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const vorlagen = data?.mailTemplates ?? [];

  const sichern = async () => {
    if (bearbeitet === null) {
      return;
    }

    setFehler(null);

    try {
      await speichern({
        variables: {
          input: {
            ...(bearbeitet.id === '' ? {} : { id: bearbeitet.id }),
            name: bearbeitet.name,
            subject: bearbeitet.subject,
            body: bearbeitet.body,
          },
        },
      });
      setBearbeitet(null);
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Fehler.');
    }
  };

  return (
    <section className="card mail-templates">
      <div className="section-heading">
        <h2>Vorlagen</h2>
        {bearbeitet === null && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setBearbeitet({ id: '', name: '', subject: null, body: '' })
            }
          >
            Neue Vorlage
          </button>
        )}
      </div>

      <p className="field__hint">
        Texte, die das Team immer wieder schreibt. Beim Antworten in der Akte
        eines Kontakts eingefügt, mit diesen Platzhaltern:{' '}
        {PLATZHALTER.map((p) => (
          <code
            key={p.key}
            className="mail-templates__token"
            title={p.beschreibung}
          >
            {`{{${p.key}}}`}
          </code>
        ))}
        . Fehlt ein Wert, steht der Ersatz nach dem Strich da, etwa{' '}
        <code className="mail-templates__token">{'{{vorname|zusammen}}'}</code>.
      </p>

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {bearbeitet !== null ? (
        <div className="mail-templates__form">
          <div className="field">
            <label htmlFor="vorlage-name">Name</label>
            <input
              id="vorlage-name"
              value={bearbeitet.name}
              maxLength={100}
              placeholder="z. B. Nachfrage zum Angebot"
              onChange={(event) =>
                setBearbeitet({ ...bearbeitet, name: event.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="vorlage-text">Text</label>
            <textarea
              id="vorlage-text"
              rows={8}
              value={bearbeitet.body}
              placeholder={
                'Hallo {{vorname}},\n\nhaben Sie unser Angebot schon ansehen können?\n\nViele Grüße\n{{mein_name}}'
              }
              onChange={(event) =>
                setBearbeitet({ ...bearbeitet, body: event.target.value })
              }
            />
          </div>
          <div className="mail-templates__actions">
            <button
              type="button"
              className="button"
              disabled={
                loading ||
                bearbeitet.name.trim() === '' ||
                bearbeitet.body.trim() === ''
              }
              onClick={() => void sichern()}
            >
              Speichern
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setBearbeitet(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : vorlagen.length === 0 ? (
        <p className="field__hint">Noch keine Vorlagen.</p>
      ) : (
        <ul className="mail-templates__list">
          {vorlagen.map((vorlage) => (
            <li key={vorlage.id}>
              <div>
                <strong>{vorlage.name}</strong>
                <div className="field__hint mail-templates__preview">
                  {vorlage.body.slice(0, 120)}
                  {vorlage.body.length > 120 ? '…' : ''}
                </div>
              </div>
              <div className="mail-templates__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setBearbeitet(vorlage)}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() =>
                    void loeschen({ variables: { id: vorlage.id } })
                  }
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
