import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  BENACHRICHTIGUNG_GELESEN,
  BENACHRICHTIGUNGEN,
  OFFENE_KI_VORSCHLAEGE,
  UNGELESENE_BENACHRICHTIGUNGEN,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';
import { IconBell } from './Icons';

type Benachrichtigung = {
  id: string;
  art: string;
  wo: string;
  von: string;
  erstelltAm: string;
  gelesen: boolean;
  sichtbar: boolean;
  auszug: string | null;
  akte: string | null;
  pfad: string | null;
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export const Glocke = () => {
  const [offen, setOffen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { data: zahlDaten, refetch: zahlNeu } = useQuery<{
    ungeleseneBenachrichtigungen: number;
  }>(UNGELESENE_BENACHRICHTIGUNGEN, { pollInterval: 120_000 });
  const [laden, { data, loading, error, refetch }] = useLazyQuery<{
    benachrichtigungen: Benachrichtigung[];
  }>(BENACHRICHTIGUNGEN, { fetchPolicy: 'network-only' });
  const [gelesen] = useMutation(BENACHRICHTIGUNG_GELESEN);
  const rechte = usePermissions();
  const { data: kiDaten } = useQuery<{ offeneKiVorschlaege: number }>(
    OFFENE_KI_VORSCHLAEGE,
    { pollInterval: 120_000, skip: !rechte.can('workspace:ki') },
  );
  const ki = kiDaten?.offeneKiVorschlaege ?? 0;
  const ungelesen = zahlDaten?.ungeleseneBenachrichtigungen ?? 0;
  const zahl = ungelesen + ki;

  useEffect(() => {
    if (!offen) {
      return undefined;
    }

    const draussen = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOffen(false);
      }
    };
    const taste = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOffen(false);
      }
    };

    window.addEventListener('mousedown', draussen);
    window.addEventListener('keydown', taste);

    return () => {
      window.removeEventListener('mousedown', draussen);
      window.removeEventListener('keydown', taste);
    };
  }, [offen]);

  const markieren = async (id?: string) => {
    await gelesen({ variables: { id: id ?? null } }).catch(() => null);
    await Promise.all([zahlNeu(), refetch()]).catch(() => null);
  };

  const liste = data?.benachrichtigungen ?? [];

  return (
    <div className="glocke" ref={ref}>
      <button
        type="button"
        className="glocke__knopf"
        aria-expanded={offen}
        aria-controls={panelId}
        aria-label={
          zahl === 0
            ? 'Benachrichtigungen'
            : [
                'Benachrichtigungen',
                ungelesen > 0 ? `${String(ungelesen)} ungelesen` : null,
                ki > 0
                  ? `${String(ki)} ${ki === 1 ? 'Vorschlag' : 'Vorschläge'} der KI offen`
                  : null,
              ]
                .filter((teil) => teil !== null)
                .join(', ')
        }
        title="Benachrichtigungen"
        onClick={() => {
          if (!offen) {
            void laden();
          }

          setOffen(!offen);
        }}
      >
        <IconBell size={17} />
        {zahl > 0 && (
          <span className="glocke__zahl" aria-hidden="true">
            {zahl > 9 ? '9+' : zahl}
          </span>
        )}
      </button>

      {offen && (
        <div
          id={panelId}
          className="glocke__panel"
          role="region"
          aria-label="Benachrichtigungen"
        >
          <div className="glocke__kopf">
            <strong>Für mich</strong>
            {liste.some((eintrag) => !eintrag.gelesen) && (
              <button
                type="button"
                className="feed__link"
                onClick={() => void markieren()}
              >
                Alle gelesen
              </button>
            )}
          </div>

          {ki > 0 && (
            <Link
              className="glocke__ki"
              to="/ki-vorschlaege"
              onClick={() => setOffen(false)}
            >
              {ki === 1
                ? '1 Vorschlag der KI wartet auf Freigabe'
                : `${String(ki)} Vorschläge der KI warten auf Freigabe`}
            </Link>
          )}

          {error !== undefined && (
            <p className="error-banner">{error.message}</p>
          )}

          {loading && liste.length === 0 ? (
            <p className="field__hint glocke__leer">Wird geladen…</p>
          ) : liste.length === 0 ? (
            <p className="field__hint glocke__leer">
              Noch nichts für Sie. Wenn jemand Sie in einer Notiz oder Aufgabe
              mit @ erwähnt oder ein Mail-Entwurf auf Ihre Freigabe wartet,
              steht es hier.
            </p>
          ) : (
            <ul className="glocke__liste">
              {liste.map((eintrag) => {
                const satz =
                  eintrag.wo === 'entwurf'
                    ? `${eintrag.von} hat einen Mail-Entwurf für Sie vorbereitet.`
                    : `${eintrag.von} hat Sie in ${eintrag.wo === 'notiz' ? 'einer Notiz' : 'einer Aufgabe'}${eintrag.akte === null ? '' : ` zu „${eintrag.akte}“`} erwähnt.`;
                const inhalt = (
                  <>
                    <span className="glocke__satz">{satz}</span>
                    {eintrag.sichtbar ? (
                      eintrag.auszug !== null &&
                      eintrag.auszug !== '' && (
                        <span className="glocke__auszug">{eintrag.auszug}</span>
                      )
                    ) : (
                      <span className="glocke__auszug">
                        Sie haben keinen Zugriff auf diesen Eintrag.
                      </span>
                    )}
                    <time
                      className="glocke__zeit"
                      dateTime={eintrag.erstelltAm}
                    >
                      {ZEIT.format(new Date(eintrag.erstelltAm))}
                    </time>
                  </>
                );

                return (
                  <li
                    key={eintrag.id}
                    className={eintrag.gelesen ? undefined : 'is-neu'}
                  >
                    {eintrag.pfad === null ? (
                      <button
                        type="button"
                        className="glocke__eintrag"
                        onClick={() => void markieren(eintrag.id)}
                      >
                        {inhalt}
                      </button>
                    ) : (
                      <Link
                        className="glocke__eintrag"
                        to={eintrag.pfad}
                        onClick={() => {
                          setOffen(false);
                          void markieren(eintrag.id);
                        }}
                      >
                        {inhalt}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
