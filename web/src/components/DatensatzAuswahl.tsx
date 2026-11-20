import { useQuery } from '@apollo/client';
import { useEffect, useId, useState } from 'react';

import {
  type AuswahlOption,
  type AuswahlTreffer,
  auswahlOptionen,
  kontaktTitel,
  naechsteMarke,
} from '../lib/auswahl';
import {
  AUSWAHL_FIRMEN,
  AUSWAHL_GESCHAEFTE,
  AUSWAHL_KONTAKTE,
} from '../lib/queries';

export type AuswahlArt = 'firma' | 'kontakt' | 'geschaeft';

type Antwort = {
  companies?: { items: { id: string; name: string; city: string | null }[] };
  contacts?: {
    items: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      company: { name: string } | null;
    }[];
  };
  deals?: {
    items: { id: string; name: string; company: { name: string } | null }[];
  };
};

const ABFRAGE = {
  firma: AUSWAHL_FIRMEN,
  kontakt: AUSWAHL_KONTAKTE,
  geschaeft: AUSWAHL_GESCHAEFTE,
};

const NEU_TEXT: Record<AuswahlArt, string> = {
  firma: 'als neue Firma anlegen',
  kontakt: 'als neuen Kontakt anlegen',
  geschaeft: 'als neues Geschäft anlegen',
};

const trefferAus = (art: AuswahlArt, daten: Antwort | undefined) => {
  if (art === 'firma') {
    return (daten?.companies?.items ?? []).map(
      (firma): AuswahlTreffer => ({
        id: firma.id,
        titel: firma.name,
        zusatz: firma.city,
      }),
    );
  }

  if (art === 'kontakt') {
    return (daten?.contacts?.items ?? []).map(
      (kontakt): AuswahlTreffer => ({
        id: kontakt.id,
        titel: kontaktTitel(kontakt),
        zusatz:
          [kontakt.company?.name, kontakt.email]
            .filter((teil) => teil != null && teil !== '')
            .join(' · ') || null,
      }),
    );
  }

  return (daten?.deals?.items ?? []).map(
    (deal): AuswahlTreffer => ({
      id: deal.id,
      titel: deal.name,
      zusatz: deal.company?.name ?? null,
    }),
  );
};

export const DatensatzAuswahl = ({
  art,
  label,
  ausser = [],
  onWaehlen,
  onNeu,
  onAbbrechen,
}: {
  art: AuswahlArt;
  label: string;
  ausser?: readonly string[];
  onWaehlen: (treffer: AuswahlTreffer) => Promise<unknown> | void;
  onNeu?: (text: string) => Promise<unknown> | void;
  onAbbrechen?: () => void;
}) => {
  const listId = useId();
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  const [marke, setMarke] = useState(-1);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const zeitgeber = window.setTimeout(() => setSuche(eingabe.trim()), 200);

    return () => window.clearTimeout(zeitgeber);
  }, [eingabe]);

  const { data, loading } = useQuery<Antwort>(ABFRAGE[art], {
    variables: { search: suche === '' ? null : suche },
    fetchPolicy: 'cache-and-network',
  });

  const optionen = auswahlOptionen(
    eingabe,
    trefferAus(art, data),
    ausser,
    onNeu !== undefined,
  );

  const nehmen = async (option: AuswahlOption | undefined) => {
    if (option === undefined || laeuft) {
      return;
    }

    setFehler(null);
    setLaeuft(true);

    try {
      await (option.art === 'treffer'
        ? onWaehlen(option.treffer)
        : onNeu?.(option.text));
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');
    } finally {
      setLaeuft(false);
    }
  };

  const optionId = (index: number) => `${listId}-${String(index)}`;

  return (
    <div className="auswahl">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={optionen.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={marke >= 0 ? optionId(marke) : undefined}
        autoFocus
        className="auswahl__eingabe"
        placeholder="Suchen…"
        value={eingabe}
        disabled={laeuft}
        onChange={(ereignis) => {
          setEingabe(ereignis.target.value);
          setMarke(-1);
        }}
        onKeyDown={(ereignis) => {
          if (ereignis.key === 'ArrowDown' || ereignis.key === 'ArrowUp') {
            ereignis.preventDefault();
            setMarke(
              naechsteMarke(
                marke,
                optionen.length,
                ereignis.key === 'ArrowDown' ? 1 : -1,
              ),
            );
          } else if (ereignis.key === 'Enter') {
            ereignis.preventDefault();
            void nehmen(optionen[marke >= 0 ? marke : 0]);
          } else if (ereignis.key === 'Escape') {
            ereignis.preventDefault();
            onAbbrechen?.();
          }
        }}
      />
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      <ul id={listId} role="listbox" className="auswahl__liste">
        {optionen.map((option, index) => (
          <li
            key={option.art === 'treffer' ? option.treffer.id : 'neu'}
            id={optionId(index)}
            role="option"
            aria-selected={index === marke}
            className={
              index === marke
                ? 'auswahl__option is-markiert'
                : 'auswahl__option'
            }
            onMouseDown={(ereignis) => {
              ereignis.preventDefault();
              void nehmen(option);
            }}
          >
            {option.art === 'treffer' ? (
              <>
                <span className="auswahl__titel">{option.treffer.titel}</span>
                {option.treffer.zusatz != null && (
                  <span className="auswahl__zusatz">
                    {option.treffer.zusatz}
                  </span>
                )}
              </>
            ) : (
              <span className="auswahl__neu">
                „{option.text}“ {NEU_TEXT[art]}
              </span>
            )}
          </li>
        ))}
        {optionen.length === 0 && !loading && (
          <li className="auswahl__leer" role="presentation">
            Nichts gefunden.
          </li>
        )}
      </ul>
      {onAbbrechen !== undefined && (
        <button
          type="button"
          className="button button--ghost auswahl__abbrechen"
          onClick={onAbbrechen}
        >
          Abbrechen
        </button>
      )}
    </div>
  );
};
