import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import {
  ansage,
  type BoardSpalte,
  type Getragen,
  tasteImBoard,
} from '../lib/boardZiehen';
import {
  type BoardFeld,
  spaltenFuer,
  spaltenSchluessel,
  wertAusSchluessel,
} from '../lib/recordBoard';
import { useKartenZiehen } from '../lib/useKartenZiehen';
import { RowMenu } from './RowMenu';
import { useToast } from './Toast';

export type RecordBoardProps<T> = {
  kennung: string;
  feld: BoardFeld;
  karten: T[];
  id: (karte: T) => string;
  titel: (karte: T) => string;
  link: (karte: T) => string;
  wert: (karte: T) => string | null;
  inhalt?: (karte: T) => ReactNode;
  darfVerschieben: boolean;
  verschieben: (karte: T, wert: string | null) => Promise<unknown>;
  zielErlaubt?: (karte: T, schluessel: string) => boolean;
  zielVerboten?: (karte: T, schluessel: string) => string;
  weitere: number;
  mehrzahl: string;
};

export const RecordBoard = <T,>({
  kennung,
  feld,
  karten,
  id,
  titel,
  link,
  wert,
  inhalt,
  darfVerschieben,
  verschieben,
  zielErlaubt,
  zielVerboten,
  weitere,
  mehrzahl,
}: RecordBoardProps<T>) => {
  const toast = useToast();
  const [meldung, setMeldung] = useState('');
  const [getragen, setGetragen] = useState<Getragen | null>(null);
  const [vorlaeufig, setVorlaeufig] = useState<Map<string, string>>(
    () => new Map(),
  );
  const fokusNach = useRef<string | null>(null);

  const stand = karten
    .map((karte) => `${id(karte)}=${wert(karte) ?? ''}`)
    .join('|');

  useEffect(() => {
    setVorlaeufig(new Map());
  }, [stand]);

  const schluesselVon = (karte: T) =>
    vorlaeufig.get(id(karte)) ?? spaltenSchluessel(wert(karte));

  const spaltenDefs = spaltenFuer(
    feld,
    karten.map((karte) => wertAusSchluessel(schluesselVon(karte))),
  );
  const inSpalte = (schluessel: string) =>
    karten.filter((karte) => schluesselVon(karte) === schluessel);
  const spalten: BoardSpalte[] = spaltenDefs.map((spalte) => ({
    stage: spalte.schluessel,
    label: spalte.label,
    nimmtAn: spalte.nimmtAn,
    karten: inSpalte(spalte.schluessel).map(id),
  }));
  const ablegen = (kartenId: string, ziel: string) => {
    const karte = karten.find((eintrag) => id(eintrag) === kartenId);
    const spalte = spaltenDefs.find((eintrag) => eintrag.schluessel === ziel);

    if (
      karte === undefined ||
      spalte === undefined ||
      !spalte.nimmtAn ||
      schluesselVon(karte) === ziel
    ) {
      return;
    }

    if (zielErlaubt !== undefined && !zielErlaubt(karte, ziel)) {
      const grund =
        zielVerboten?.(karte, ziel) ??
        `„${titel(karte)}“ lässt sich nicht nach ${spalte.label} verschieben.`;

      toast.zeige({ text: grund });
      setMeldung(grund);

      return;
    }

    const zurueck = () =>
      setVorlaeufig((alt) => {
        const neu = new Map(alt);

        neu.delete(kartenId);

        return neu;
      });

    setVorlaeufig((alt) => new Map(alt).set(kartenId, ziel));
    setMeldung(`„${titel(karte)}“ nach ${spalte.label} verschoben.`);

    void verschieben(karte, wertAusSchluessel(ziel))
      .then((ergebnis) => {
        if (ergebnis === false) {
          zurueck();
          setMeldung(`„${titel(karte)}“ bleibt, wo es war.`);
        }
      })
      .catch((fehler: Error) => {
        zurueck();
        toast.zeige({ text: fehler.message });
        setMeldung(`Nicht verschoben: ${fehler.message}`);
      });
  };

  const ziehen = useKartenZiehen(ablegen);

  useEffect(() => {
    const kartenId = fokusNach.current;

    if (kartenId === null) {
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-karte="${kennung}"][data-karte-id="${kartenId}"]`,
    );

    if (element !== null) {
      element.focus();
      fokusNach.current = null;
    }
  });

  const fokus = (kartenId: string) =>
    document
      .querySelector<HTMLElement>(
        `[data-karte="${kennung}"][data-karte-id="${kartenId}"]`,
      )
      ?.focus();

  const beiTaste = (event: KeyboardEvent<HTMLElement>, karte: T) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const kartenId = id(karte);
    const von = schluesselVon(karte);
    const spaltenDerKarte =
      zielErlaubt === undefined
        ? spalten
        : spalten.map((spalte) => ({
            ...spalte,
            nimmtAn:
              spalte.nimmtAn &&
              (spalte.stage === von || zielErlaubt(karte, spalte.stage)),
          }));
    const ergebnis = tasteImBoard(
      event.key,
      spaltenDerKarte,
      kartenId,
      darfVerschieben && getragen?.dealId === kartenId ? getragen : null,
    );

    if (
      ergebnis.art === 'nichts' ||
      (!darfVerschieben && ergebnis.art !== 'fokus')
    ) {
      return;
    }

    if (event.key !== 'Tab') {
      event.preventDefault();
    }

    const text = ansage(ergebnis, spaltenDerKarte, titel(karte), feld.label);

    if (text !== null) {
      setMeldung(text);
    }

    switch (ergebnis.art) {
      case 'fokus':
        fokus(ergebnis.dealId);
        break;
      case 'aufnehmen':
      case 'ziel':
        setGetragen(ergebnis.getragen);
        break;
      case 'ablegen':
        setGetragen(null);
        fokusNach.current = kartenId;
        ablegen(kartenId, ergebnis.getragen.ziel);
        break;
      case 'abbrechen':
        setGetragen(null);
        break;
    }
  };

  const anleitung = `${kennung}-board-anleitung`;

  return (
    <>
      {weitere > 0 && (
        <div className="notice">
          Das Board zeigt die ersten {karten.length} {mehrzahl}; {weitere}{' '}
          weitere finden Sie in der Liste oder mit einem Filter.
        </div>
      )}

      <p id={anleitung} className="visually-hidden">
        {darfVerschieben
          ? `Leertaste nimmt die Karte auf. Pfeil links und rechts wählen ${feld.label}, Leertaste legt ab, Escape bricht ab. Pfeil hoch und runter gehen zur nächsten Karte.`
          : 'Pfeiltasten gehen von Karte zu Karte.'}
      </p>
      <div className="visually-hidden" role="status" aria-live="assertive">
        {meldung}
      </div>

      <div className="board">
        {spaltenDefs.map((spalte) => {
          const inhaltDerSpalte = inSpalte(spalte.schluessel);
          const istZiel =
            (getragen !== null &&
              getragen.ziel === spalte.schluessel &&
              getragen.ziel !== getragen.von) ||
            (ziehen.zustand !== null &&
              ziehen.zustand.ziel === spalte.schluessel &&
              inhaltDerSpalte.every(
                (karte) => id(karte) !== ziehen.zustand?.dealId,
              ));
          const getrageneKarte =
            getragen !== null && istZiel
              ? karten.find((karte) => id(karte) === getragen.dealId)
              : undefined;

          return (
            <section
              key={spalte.schluessel === '' ? '\u0000' : spalte.schluessel}
              className={
                istZiel ? 'board__column is-drag-over' : 'board__column'
              }
              aria-label={`${spalte.label}, ${String(inhaltDerSpalte.length)}`}
              data-board-ziel={spalte.nimmtAn ? spalte.schluessel : undefined}
            >
              <header className="board__head">
                <span
                  className={
                    spalte.farbe === null
                      ? 'board__stage'
                      : `board__stage option-chip option-chip--${spalte.farbe}`
                  }
                >
                  {spalte.label}
                </span>
                <span className="board__count">{inhaltDerSpalte.length}</span>
              </header>

              <div className="board__cards">
                {inhaltDerSpalte.map((karte) => {
                  const kartenId = id(karte);
                  const klasse =
                    getragen?.dealId === kartenId
                      ? 'board__card is-lifted'
                      : ziehen.zustand?.dealId === kartenId
                        ? 'board__card is-dragging'
                        : 'board__card';
                  const ziele = spaltenDefs.filter(
                    (eintrag) =>
                      eintrag.nimmtAn &&
                      eintrag.schluessel !== schluesselVon(karte) &&
                      (zielErlaubt === undefined ||
                        zielErlaubt(karte, eintrag.schluessel)),
                  );

                  return (
                    <article
                      key={kartenId}
                      data-karte={kennung}
                      data-karte-id={kartenId}
                      className={klasse}
                      tabIndex={0}
                      aria-roledescription={
                        darfVerschieben ? 'verschiebbare Karte' : 'Karte'
                      }
                      aria-label={titel(karte)}
                      aria-describedby={anleitung}
                      onKeyDown={(event) => beiTaste(event, karte)}
                      onBlur={(event) => {
                        if (
                          getragen?.dealId === kartenId &&
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          setGetragen(null);
                        }
                      }}
                      onPointerDown={
                        darfVerschieben
                          ? (event) => ziehen.onPointerDown(event, kartenId)
                          : undefined
                      }
                    >
                      <div className="board__card-top">
                        <Link
                          to={link(karte)}
                          className="board__card-title"
                          draggable={false}
                        >
                          {titel(karte)}
                        </Link>
                        {darfVerschieben && ziele.length > 0 && (
                          <RowMenu
                            label={`Aktionen für ${titel(karte)}`}
                            items={ziele.map((ziel) => ({
                              label: `Nach „${ziel.label}“ verschieben`,
                              onSelect: () => {
                                fokusNach.current = kartenId;
                                ablegen(kartenId, ziel.schluessel);
                              },
                            }))}
                          />
                        )}
                      </div>
                      {inhalt?.(karte)}
                    </article>
                  );
                })}

                {getrageneKarte !== undefined && (
                  <div className="board__ablage" aria-hidden="true">
                    „{titel(getrageneKarte)}“ hier ablegen
                  </div>
                )}

                {inhaltDerSpalte.length === 0 &&
                  getrageneKarte === undefined && (
                    <div className="board__empty">Leer</div>
                  )}
              </div>
            </section>
          );
        })}
      </div>
      {spalten.length === 0 && (
        <p className="field__hint">
          {`Für „${feld.label}“ gibt es noch keine Werte.`}
        </p>
      )}
    </>
  );
};
