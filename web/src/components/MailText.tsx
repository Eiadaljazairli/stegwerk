import { useMutation } from '@apollo/client';
import { useState } from 'react';

import { downloadAttachment } from '../lib/download';
import { MAIL_ANHANG_SPEICHERN } from '../lib/queries';
import { type MailInhalt } from '../lib/types';
import { lesbareGroesse } from './AttachmentsSection';

export const MailText = ({
  inhalt,
  ersatz,
}: {
  inhalt: MailInhalt | undefined;
  ersatz: string | null;
}): JSX.Element => {
  const [zitatOffen, setZitatOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichern, { loading }] = useMutation<{
    mailAnhangSpeichern: MailInhalt;
  }>(MAIL_ANHANG_SPEICHERN, {
    refetchQueries: ['Attachments'],
  });

  if (inhalt?.inhaltVerborgen === true) {
    return (
      <p className="messages__snippet messages__snippet--verborgen">
        Der Text bleibt im Postfach der Kollegin oder des Kollegen.
      </p>
    );
  }

  const text = inhalt?.inhalt ?? ersatz;

  return (
    <div className="mail-text">
      {text !== null && text !== '' && (
        <p className="mail-text__inhalt">{text}</p>
      )}

      {inhalt?.zitat !== null && inhalt?.zitat !== undefined && (
        <>
          <button
            type="button"
            className="button button--quiet mail-text__zitat-knopf"
            aria-expanded={zitatOffen}
            onClick={() => setZitatOffen(!zitatOffen)}
          >
            {zitatOffen
              ? 'Zitat und Signatur ausblenden'
              : '… Zitat und Signatur'}
          </button>
          {zitatOffen && (
            <p className="mail-text__inhalt mail-text__zitat">{inhalt.zitat}</p>
          )}
        </>
      )}

      {inhalt !== undefined && inhalt.anhaenge.length > 0 && (
        <ul className="mail-text__anhaenge" aria-label="Anhänge">
          {inhalt.anhaenge.map((anhang) => (
            <li key={anhang.index}>
              <span className="mail-text__datei">
                {anhang.name}
                <span className="field__hint">
                  {' '}
                  · {lesbareGroesse(anhang.groesse)}
                </span>
              </span>
              {anhang.gespeichertId === null ? (
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={loading}
                  onClick={() => {
                    setFehler(null);
                    void speichern({
                      variables: {
                        nachrichtId: inhalt.id,
                        index: anhang.index,
                      },
                    }).catch((problem: unknown) => {
                      setFehler(
                        problem instanceof Error
                          ? problem.message
                          : 'Der Anhang ließ sich nicht übernehmen.',
                      );
                    });
                  }}
                >
                  An Akte speichern
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    void downloadAttachment(
                      anhang.gespeichertId ?? '',
                      anhang.name,
                    ).catch((problem: unknown) => {
                      setFehler(
                        problem instanceof Error
                          ? problem.message
                          : 'Herunterladen fehlgeschlagen.',
                      );
                    });
                  }}
                >
                  An der Akte · öffnen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {fehler !== null && (
        <p className="field__error" role="alert">
          {fehler}
        </p>
      )}
    </div>
  );
};
