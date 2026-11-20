import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  alsEingabe,
  blaettertAuswahl,
  type EingabeTyp,
  pruefeEntwurf,
} from '../lib/inlineWert';

export type { EingabeTyp } from '../lib/inlineWert';

export const useInlineEntwurf = ({
  typ,
  ausgang,
  onSpeichern,
}: {
  typ: EingabeTyp;
  ausgang: string | number | null;
  onSpeichern: (wert: string | number | null) => Promise<unknown>;
}) => {
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [unlesbar, setUnlesbar] = useState(false);
  const laeuft = useRef(false);

  const beginnen = (mitZeichen?: string) => {
    if (!speichert) {
      setEntwurf(mitZeichen ?? alsEingabe(typ, ausgang));
    }
  };

  const abbrechen = () => {
    setEntwurf(null);
    setUnlesbar(false);
  };

  const fertig = (roh: string | null = entwurf) => {
    if (roh === null || laeuft.current) {
      return;
    }

    const pruefung = pruefeEntwurf(typ, roh, ausgang);

    if (pruefung.art === 'unveraendert') {
      abbrechen();

      return;
    }

    if (pruefung.art === 'unlesbar') {
      setUnlesbar(true);

      return;
    }

    setUnlesbar(false);
    laeuft.current = true;
    setSpeichert(true);
    void onSpeichern(pruefung.wert)
      .catch(() => null)
      .finally(() => {
        laeuft.current = false;
        setSpeichert(false);
        setEntwurf(null);
      });
  };

  return {
    entwurf,
    bearbeitet: entwurf !== null,
    speichert,
    unlesbar,
    beginnen,
    abbrechen,
    fertig,
    aendern: (wert: string) => {
      setEntwurf(wert);
      setUnlesbar(false);
    },
  };
};

type Entwurf = ReturnType<typeof useInlineEntwurf>;

export const InlineEingabe = ({
  label,
  typ,
  entwurf,
  optionen,
  className = 'list-table__eingabe',
  onZurueck,
}: {
  label: string;
  typ: EingabeTyp;
  entwurf: Entwurf;
  optionen?: { wert: string; label: string }[];
  className?: string;
  onZurueck?: () => void;
}) => {
  const perTaste = useRef(false);

  const tasten = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    perTaste.current = typ === 'select' && blaettertAuswahl(event);

    if (event.key === 'Enter') {
      event.preventDefault();
      onZurueck?.();
      entwurf.fertig();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onZurueck?.();
      entwurf.abbrechen();
    }
  };

  if (typ === 'select') {
    return (
      <select
        className={className}
        aria-label={label}
        value={entwurf.entwurf ?? ''}
        autoFocus
        onChange={(event) => {
          entwurf.aendern(event.target.value);

          if (perTaste.current) {
            perTaste.current = false;

            return;
          }

          onZurueck?.();
          entwurf.fertig(event.target.value);
        }}
        onPointerDown={() => {
          perTaste.current = false;
        }}
        onBlur={() => entwurf.fertig()}
        onKeyDown={tasten}
      >
        {(optionen ?? []).map((option) => (
          <option key={option.wert} value={option.wert}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={className}
      aria-label={label}
      type={typ === 'number' ? 'text' : typ}
      inputMode={typ === 'number' ? 'decimal' : undefined}
      aria-invalid={entwurf.unlesbar || undefined}
      title={
        entwurf.unlesbar ? 'Keine Zahl — etwa 1.500 oder 2500,50' : undefined
      }
      value={entwurf.entwurf ?? ''}
      autoFocus
      onFocus={(event) => {
        if (typ !== 'date') {
          const laenge = event.target.value.length;

          event.target.setSelectionRange(laenge, laenge);
        }
      }}
      onChange={(event) => entwurf.aendern(event.target.value)}
      onBlur={() => entwurf.fertig()}
      onKeyDown={tasten}
    />
  );
};

export const KartenFeld = ({
  label,
  typ,
  ausgang,
  optionen,
  darfAendern,
  anzeige,
  className,
  onSpeichern,
  onBearbeiten,
}: {
  label: string;
  typ: EingabeTyp;
  ausgang: string | number | null;
  optionen?: { wert: string; label: string }[];
  darfAendern: boolean;
  anzeige: ReactNode;
  className?: string;
  onSpeichern: (wert: string | number | null) => Promise<unknown>;
  onBearbeiten?: (an: boolean) => void;
}) => {
  const entwurf = useInlineEntwurf({ typ, ausgang, onSpeichern });
  const knopf = useRef<HTMLButtonElement>(null);
  const zurueck = useRef(false);
  const bearbeitet = entwurf.bearbeitet;

  useEffect(() => {
    onBearbeiten?.(bearbeitet);

    if (!bearbeitet && zurueck.current) {
      zurueck.current = false;
      knopf.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearbeitet]);

  if (!darfAendern) {
    return <span className={className}>{anzeige}</span>;
  }

  return (
    <span
      className="karten-feld"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {bearbeitet ? (
        <InlineEingabe
          label={label}
          typ={typ}
          entwurf={entwurf}
          optionen={optionen}
          className="karten-feld__eingabe"
          onZurueck={() => {
            zurueck.current = true;
          }}
        />
      ) : (
        <button
          ref={knopf}
          type="button"
          className={
            entwurf.speichert
              ? `karten-feld__wert is-saving ${className ?? ''}`
              : `karten-feld__wert ${className ?? ''}`
          }
          title={`${label} ändern`}
          disabled={entwurf.speichert}
          onClick={() => entwurf.beginnen()}
        >
          <span className="visually-hidden">{label} ändern: </span>
          {anzeige}
        </button>
      )}
    </span>
  );
};
