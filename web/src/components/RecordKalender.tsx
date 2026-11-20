import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  isSameMonth,
  isWeekend,
  monthGrid,
  monthLabel,
  shiftMonth,
  startOfMonth,
  todayInBerlin,
  WEEKDAYS,
  weekdayIndex,
} from '../lib/calendar-grid';
import {
  kalenderAnsage,
  type KalenderGetragen,
  kalenderZeitraum,
  KARTEN_JE_TAG,
  kartenJeTag,
  sichtbareKarten,
  tagVorgelesen,
  tasteImKalender,
} from '../lib/kalenderZiehen';
import { useKartenZiehen } from '../lib/useKartenZiehen';
import { IconChevronLeft, IconChevronRight } from './Icons';
import { useToast } from './Toast';

export const useKalenderMonat = (): [string, (monat: string) => void] => {
  const [monat, setMonat] = useState(() => startOfMonth(todayInBerlin()));

  return [monat, setMonat];
};

export type RecordKalenderProps<T> = {
  kennung: string;
  monat: string;
  setMonat: (monat: string) => void;
  feldLabel: string;
  karten: T[];
  id: (karte: T) => string;
  titel: (karte: T) => string;
  link: (karte: T) => string;
  datum: (karte: T) => string | null;
  inhalt?: (karte: T) => ReactNode;
  kartenKlasse?: (karte: T) => string | undefined;
  darfVerschieben: boolean;
  verschieben: (karte: T, tag: string) => Promise<unknown>;
  laedt: boolean;
  weitere: number;
  mehrzahl: string;
};

export const RecordKalender = <T,>({
  kennung,
  monat,
  setMonat,
  feldLabel,
  karten,
  id,
  titel,
  link,
  datum,
  inhalt,
  kartenKlasse,
  darfVerschieben,
  verschieben,
  laedt,
  weitere,
  mehrzahl,
}: RecordKalenderProps<T>) => {
  const toast = useToast();
  const [meldung, setMeldung] = useState('');
  const [getragen, setGetragen] = useState<KalenderGetragen | null>(null);
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(() => new Set());
  const [vorlaeufig, setVorlaeufig] = useState<Map<string, string>>(
    () => new Map(),
  );
  const tage = monthGrid(monat);
  const sichtbar = kalenderZeitraum(monat);
  const stand = karten
    .map((karte) => `${id(karte)}=${datum(karte) ?? ''}`)
    .join('|');

  useEffect(() => {
    setVorlaeufig(new Map());
  }, [stand]);

  const tagVon = (karte: T) =>
    vorlaeufig.get(id(karte)) ?? datum(karte)?.slice(0, 10) ?? null;
  const jeTag = kartenJeTag(karten, tagVon);

  const ablegen = (kartenId: string, tag: string) => {
    const karte = karten.find((eintrag) => id(eintrag) === kartenId);

    if (karte === undefined || tagVon(karte) === tag) {
      return;
    }

    setVorlaeufig((alt) => new Map(alt).set(kartenId, tag));
    setMeldung(`„${titel(karte)}“ auf ${tagVorgelesen(tag)} gelegt.`);

    void verschieben(karte, tag).catch((fehler: Error) => {
      setVorlaeufig((alt) => {
        const neu = new Map(alt);

        neu.delete(kartenId);

        return neu;
      });
      toast.zeige({ text: fehler.message });
      setMeldung(`Nicht verschoben: ${fehler.message}`);
    });
  };

  const ziehen = useKartenZiehen(ablegen);

  const fokus = (kartenId: string) =>
    window.setTimeout(() =>
      document
        .querySelector<HTMLElement>(
          `[data-karte="${kennung}"][data-karte-id="${kartenId}"]`,
        )
        ?.focus(),
    );

  const beiTaste = (event: KeyboardEvent<HTMLElement>, karte: T) => {
    if (event.target !== event.currentTarget || !darfVerschieben) {
      return;
    }

    const kartenId = id(karte);
    const tag = tagVon(karte);

    if (tag === null) {
      return;
    }

    const ergebnis = tasteImKalender(
      event.key,
      kartenId,
      tag,
      getragen?.id === kartenId ? getragen : null,
      sichtbar,
    );

    if (ergebnis.art === 'nichts') {
      return;
    }

    if (event.key !== 'Tab') {
      event.preventDefault();
    }

    const text = kalenderAnsage(ergebnis, titel(karte));

    if (text !== null) {
      setMeldung(text);
    }

    switch (ergebnis.art) {
      case 'aufnehmen':
      case 'ziel':
        setGetragen(ergebnis.getragen);
        break;
      case 'ablegen':
        setGetragen(null);
        ablegen(kartenId, ergebnis.getragen.ziel);
        fokus(kartenId);
        break;
      case 'abbrechen':
        setGetragen(null);
        break;
      case 'rand':
        break;
    }
  };

  const anleitung = `${kennung}-kalender-anleitung`;
  const heutigerTag = todayInBerlin();

  return (
    <>
      <div className="rkal__kopf">
        <button
          type="button"
          className="button button--ghost button--small"
          aria-label="Voriger Monat"
          onClick={() => setMonat(shiftMonth(monat, -1))}
        >
          <IconChevronLeft size={16} />
        </button>
        <h2 className="rkal__monat" aria-live="polite">
          {monthLabel(monat)}
        </h2>
        <button
          type="button"
          className="button button--ghost button--small"
          aria-label="Nächster Monat"
          onClick={() => setMonat(shiftMonth(monat, 1))}
        >
          <IconChevronRight size={16} />
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setMonat(startOfMonth(heutigerTag))}
        >
          Heute
        </button>
        <span className="field__hint rkal__feld">
          {laedt ? 'Lädt…' : `nach ${feldLabel}`}
        </span>
      </div>

      {weitere > 0 && (
        <div className="notice">
          Der Kalender zeigt die ersten {karten.length} {mehrzahl} dieser
          Wochen; {weitere} weitere finden Sie in der Liste oder mit einem
          Filter.
        </div>
      )}

      <p id={anleitung} className="visually-hidden">
        {darfVerschieben
          ? 'Leertaste nimmt die Karte auf. Pfeil links und rechts gehen einen Tag weiter, hoch und runter eine Woche. Leertaste legt ab, Escape bricht ab.'
          : `Die Karten liegen an ihrem Tag (${feldLabel}).`}
      </p>
      <div className="visually-hidden" role="status" aria-live="assertive">
        {meldung}
      </div>

      <div className="rkal">
        <div className="rkal__wochentage" aria-hidden="true">
          {WEEKDAYS.map((tag) => (
            <div key={tag} className="rkal__wochentag">
              {tag}
            </div>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((woche) => (
          <div key={woche} className="rkal__woche">
            {tage.slice(woche * 7, woche * 7 + 7).map((tag) => {
              const amTag = jeTag.get(tag) ?? [];
              const offen = aufgeklappt.has(tag);
              const { gezeigt, weitere: mehr } = sichtbareKarten(amTag, offen);
              const istZiel =
                (getragen !== null &&
                  getragen.ziel === tag &&
                  getragen.ziel !== getragen.von) ||
                (ziehen.zustand !== null && ziehen.zustand.ziel === tag);
              const klassen = [
                'rkal__tag',
                isSameMonth(tag, monat) ? '' : 'rkal__tag--fremd',
                isWeekend(tag) ? 'rkal__tag--wochenende' : '',
                tag === heutigerTag ? 'rkal__tag--heute' : '',
                istZiel ? 'is-drag-over' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={tag}
                  className={klassen}
                  role="group"
                  aria-label={`${tagVorgelesen(tag)}, ${String(amTag.length)} ${amTag.length === 1 ? 'Eintrag' : 'Einträge'}`}
                  data-board-ziel={darfVerschieben ? tag : undefined}
                >
                  <span className="rkal__zahl" aria-hidden="true">
                    <span className="rkal__wt">
                      {WEEKDAYS[weekdayIndex(tag)]},{' '}
                    </span>
                    {Number(tag.slice(8, 10))}
                  </span>
                  {gezeigt.map((karte) => {
                    const kartenId = id(karte);
                    const zusatz = kartenKlasse?.(karte);

                    return (
                      <article
                        key={kartenId}
                        data-karte={kennung}
                        data-karte-id={kartenId}
                        className={[
                          'rkal__karte',
                          getragen?.id === kartenId ? 'is-lifted' : '',
                          ziehen.zustand?.dealId === kartenId
                            ? 'is-dragging'
                            : '',
                          zusatz ?? '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        tabIndex={0}
                        aria-roledescription={
                          darfVerschieben ? 'verschiebbare Karte' : 'Karte'
                        }
                        aria-label={titel(karte)}
                        aria-describedby={anleitung}
                        onKeyDown={(event) => beiTaste(event, karte)}
                        onBlur={(event) => {
                          if (
                            getragen?.id === kartenId &&
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
                        <Link
                          to={link(karte)}
                          className="rkal__titel"
                          draggable={false}
                        >
                          {titel(karte)}
                        </Link>
                        {inhalt?.(karte)}
                      </article>
                    );
                  })}
                  {mehr > 0 && (
                    <button
                      type="button"
                      className="rkal__mehr"
                      onClick={() =>
                        setAufgeklappt((alt) => new Set(alt).add(tag))
                      }
                    >
                      + {mehr} weitere
                    </button>
                  )}
                  {offen && amTag.length > KARTEN_JE_TAG + 1 && (
                    <button
                      type="button"
                      className="rkal__mehr"
                      onClick={() =>
                        setAufgeklappt((alt) => {
                          const neu = new Set(alt);

                          neu.delete(tag);

                          return neu;
                        })
                      }
                    >
                      Weniger
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="field__hint">
        Einträge ohne {feldLabel} stehen nicht im Kalender; Sie finden sie in
        der Liste.
      </p>
    </>
  );
};
