import { useMutation } from '@apollo/client';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  anbieterName,
  BEZUG_TEXT,
  bezugAusPfad,
  type ChatNachricht,
  MAX_NACHRICHT,
  modellName,
  verlaufFuerServer,
} from '../lib/ki';
import { KI_CHAT } from '../lib/queries';
import { useKi } from '../lib/useKi';
import { usePermissions } from '../lib/usePermissions';
import { IconClose, IconSuggestions } from './Icons';

type ChatAntwort = {
  antwort: string;
  gekuerzt: boolean;
  vorschlaege: { id: string; zusammenfassung: string }[];
  schritte: { werkzeug: string; titel: string; ok: boolean }[];
};

export const KiChat = () => {
  const { einstellung, nutzbar } = useKi();
  const { can } = usePermissions();
  const [offen, setOffen] = useState(false);
  const [nachrichten, setNachrichten] = useState<ChatNachricht[]>([]);
  const [eingabe, setEingabe] = useState('');
  const [mitBezug, setMitBezug] = useState(true);
  const [fragen, { loading }] = useMutation<{ kiChat: ChatAntwort }>(KI_CHAT);
  const knopf = useRef<HTMLButtonElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);
  const ende = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const bezug = bezugAusPfad(pathname);
  const titelId = useId();
  const feldId = useId();

  useEffect(() => {
    if (offen) {
      feld.current?.focus();
    }
  }, [offen]);

  useEffect(() => {
    ende.current?.scrollIntoView?.({ block: 'end' });
  }, [nachrichten, loading]);

  if (!nutzbar || einstellung === null) {
    return null;
  }

  const schliessen = () => {
    setOffen(false);
    knopf.current?.focus();
  };

  const senden = async () => {
    const text = eingabe.trim();

    if (text === '' || loading) {
      return;
    }

    const neu: ChatNachricht[] = [...nachrichten, { rolle: 'user', text }];

    setNachrichten(neu);
    setEingabe('');

    try {
      const ergebnis = await fragen({
        variables: {
          input: {
            nachrichten: verlaufFuerServer(neu),
            bezug: mitBezug ? bezug : null,
          },
        },
      });
      const antwort = ergebnis.data?.kiChat;

      setNachrichten([
        ...neu,
        {
          rolle: 'assistant',
          text:
            (antwort?.antwort ?? '').trim() === ''
              ? 'Keine Antwort erhalten.'
              : (antwort?.antwort ?? ''),
          vorschlaege: antwort?.vorschlaege ?? [],
          schritte: antwort?.schritte ?? [],
        },
      ]);
    } catch (problem) {
      setNachrichten([
        ...neu,
        {
          rolle: 'assistant',
          text: problem instanceof Error ? problem.message : 'Das ging nicht.',
          fehler: true,
        },
      ]);
    }
  };

  return (
    <>
      <button
        ref={knopf}
        type="button"
        className="topbar__ki"
        aria-expanded={offen}
        aria-controls={offen ? titelId : undefined}
        onClick={() => (offen ? schliessen() : setOffen(true))}
      >
        <IconSuggestions size={16} />
        <span className="topbar__ki-label">KI fragen</span>
      </button>

      {offen && (
        <aside
          id={titelId}
          className="ki-chat"
          aria-label="KI-Chat"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              schliessen();
            }
          }}
        >
          <header className="ki-chat__kopf">
            <div>
              <h2>KI fragen</h2>
              <p className="ki-chat__modell">
                {modellName(einstellung.anbieter, einstellung.modell)} ·{' '}
                {anbieterName(einstellung.anbieter)}
              </p>
            </div>
            <div className="ki-chat__kopf-aktionen">
              {nachrichten.length > 0 && (
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={loading}
                  onClick={() => {
                    setNachrichten([]);
                    feld.current?.focus();
                  }}
                >
                  Neuer Chat
                </button>
              )}
              <button
                type="button"
                className="button button--quiet"
                aria-label="KI-Chat schließen"
                onClick={schliessen}
              >
                <IconClose size={16} />
              </button>
            </div>
          </header>

          <div
            className="ki-chat__verlauf"
            role="log"
            aria-live="polite"
            aria-busy={loading}
          >
            {nachrichten.length === 0 && (
              <div className="ki-chat__leer">
                <p>
                  Fragen Sie nach Ihren Firmen, Kontakten, Geschäften und
                  Angeboten, etwa: „Welche Geschäfte über 10.000 € schließen
                  diesen Monat?“ oder „Fasse die letzten Notizen zu Müller GmbH
                  zusammen.“
                </p>
                <p className="field__hint">
                  Die KI sieht nur, was Sie selbst sehen dürfen. Ändern kann sie
                  nichts: Änderungen legt sie als Vorschlag ab, den jemand mit
                  dem Recht dazu unter „KI-Vorschläge“ annimmt. Ihre Frage und
                  die nachgeschlagenen Daten gehen an{' '}
                  {anbieterName(einstellung.anbieter)}, unter dem Vertrag Ihres
                  Bereichs mit dem Anbieter. Stegwerk speichert den Chat nicht.
                </p>
              </div>
            )}

            {nachrichten.map((nachricht, index) => (
              <div
                key={index}
                className={
                  nachricht.rolle === 'user'
                    ? 'ki-chat__nachricht ki-chat__nachricht--frage'
                    : nachricht.fehler === true
                      ? 'ki-chat__nachricht ki-chat__nachricht--fehler'
                      : 'ki-chat__nachricht'
                }
                role={nachricht.fehler === true ? 'alert' : undefined}
              >
                <span className="visually-hidden">
                  {nachricht.rolle === 'user' ? 'Sie:' : 'KI:'}
                </span>
                <p className="ki-chat__text">{nachricht.text}</p>

                {(nachricht.schritte?.length ?? 0) > 0 && (
                  <p className="ki-chat__schritte">
                    Nachgeschlagen:{' '}
                    {[
                      ...new Set(
                        (nachricht.schritte ?? []).map(
                          (schritt) =>
                            `${schritt.titel}${schritt.ok ? '' : ' (ging nicht)'}`,
                        ),
                      ),
                    ].join(', ')}
                  </p>
                )}

                {(nachricht.vorschlaege?.length ?? 0) > 0 && (
                  <div className="ki-chat__vorschlaege">
                    <p>Wartet auf Freigabe:</p>
                    <ul>
                      {(nachricht.vorschlaege ?? []).map((vorschlag) => (
                        <li key={vorschlag.id}>{vorschlag.zusammenfassung}</li>
                      ))}
                    </ul>
                    {can('workspace:ki') ? (
                      <Link to="/ki-vorschlaege">Zu den KI-Vorschlägen</Link>
                    ) : (
                      <p className="field__hint">
                        Freigeben kann, wer KI-Vorschläge verwaltet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <p className="ki-chat__denkt" role="status">
                Die KI schlägt nach …
              </p>
            )}
            <div ref={ende} />
          </div>

          <form
            className="ki-chat__eingabe"
            onSubmit={(event) => {
              event.preventDefault();
              void senden();
            }}
          >
            {bezug !== null && (
              <label className="checkbox-field ki-chat__bezug">
                <input
                  type="checkbox"
                  checked={mitBezug}
                  onChange={(event) => setMitBezug(event.target.checked)}
                />
                Frage bezieht sich auf {BEZUG_TEXT[bezug.art]}
              </label>
            )}
            <label htmlFor={feldId} className="visually-hidden">
              Ihre Frage
            </label>
            <textarea
              id={feldId}
              ref={feld}
              rows={3}
              maxLength={MAX_NACHRICHT}
              value={eingabe}
              placeholder="Ihre Frage … (Umschalt+Enter für eine neue Zeile)"
              onChange={(event) => setEingabe(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void senden();
                }
              }}
            />
            <button
              type="submit"
              className="button button--primary"
              disabled={loading || eingabe.trim() === ''}
            >
              Fragen
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
