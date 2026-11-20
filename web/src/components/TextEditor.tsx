import { useQuery } from '@apollo/client';
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../lib/auth';
import {
  erwaehnung,
  offeneErwaehnung,
  schalteHaken,
} from '../lib/formatierter-text';
import { FormatierterText } from './FormatierterText';
import {
  IconBold,
  IconChecklist,
  IconHeading,
  IconItalic,
  IconLink,
  IconList,
  IconMention,
  IconNumberedList,
} from './Icons';
import { type Person, TEAM_NAMEN } from './Verantwortlich';

type Auswahl = { start: number; ende: number };

const LISTENZEILE = /^(\s*)([-*] \[[ xX]\] |[-*] |(\d{1,3})([.)]) )(.*)$/u;

const fortsetzung = (
  zeile: string,
): { prefix: string; leer: boolean } | null => {
  const treffer = LISTENZEILE.exec(zeile);

  if (treffer === null) {
    return null;
  }

  const [, einzug, marke, zahl, trenner, rest] = treffer;
  const naechste =
    zahl === undefined
      ? marke.replace(/\[[xX]\]/u, '[ ]')
      : `${String(Number(zahl) + 1)}${trenner} `;

  return { prefix: `${einzug}${naechste}`, leer: rest.trim() === '' };
};

export const TextEditor = ({
  value,
  onChange,
  label,
  id,
  rows = 3,
  placeholder,
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onChange: (wert: string) => void;
  label: string;
  id?: string;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) => {
  const eigeneId = useId();
  const feldId = id ?? `${eigeneId}-feld`;
  const listeId = `${eigeneId}-personen`;
  const feld = useRef<HTMLTextAreaElement>(null);
  const [vorschau, setVorschau] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [markiert, setMarkiert] = useState(0);
  const [geschlossen, setGeschlossen] = useState(false);
  const naechsteAuswahl = useRef<Auswahl | null>(null);
  const { session } = useAuth();
  const { data } = useQuery<{ workspaceMembers: { user: Person }[] }>(
    TEAM_NAMEN,
  );

  useLayoutEffect(() => {
    const auswahl = naechsteAuswahl.current;

    if (auswahl !== null && feld.current !== null) {
      feld.current.focus();
      feld.current.setSelectionRange(auswahl.start, auswahl.ende);
      setCursor(auswahl.ende);
      naechsteAuswahl.current = null;
    }
  });

  const setze = (neu: string, auswahl: Auswahl) => {
    naechsteAuswahl.current = auswahl;
    onChange(neu);
  };

  const offen =
    vorschau || geschlossen ? null : offeneErwaehnung(value, cursor);
  const ich = session?.user.id;
  const vorschlaege =
    offen === null
      ? []
      : (data?.workspaceMembers ?? [])
          .map((mitglied) => mitglied.user)
          .filter((person) => person.id !== ich)
          .filter((person) =>
            `${person.firstName} ${person.lastName}`
              .toLowerCase()
              .includes(offen.suche.toLowerCase()),
          )
          .slice(0, 6);
  const zeigeVorschlaege = offen !== null && vorschlaege.length > 0;
  const aktiv = Math.min(markiert, Math.max(vorschlaege.length - 1, 0));

  const einsetzen = (person: Person) => {
    if (offen === null) {
      return;
    }

    const marke = `${erwaehnung(`${person.firstName} ${person.lastName}`, person.id)} `;
    const neu = value.slice(0, offen.start) + marke + value.slice(cursor);
    const ende = offen.start + marke.length;

    setMarkiert(0);
    setze(neu, { start: ende, ende });
  };

  const umschliessen = (
    vorne: string,
    hinten = vorne,
    platzhalter = 'Text',
  ) => {
    const element = feld.current;
    const start = element?.selectionStart ?? value.length;
    const ende = element?.selectionEnd ?? value.length;
    const innen = value.slice(start, ende) || platzhalter;
    const neu =
      value.slice(0, start) + vorne + innen + hinten + value.slice(ende);

    setze(neu, {
      start: start + vorne.length,
      ende: start + vorne.length + innen.length,
    });
  };

  const zeilenAnfang = (marke: (index: number) => string) => {
    const element = feld.current;
    const start = element?.selectionStart ?? value.length;
    const ende = element?.selectionEnd ?? value.length;
    const zeilenStart = value.lastIndexOf('\n', start - 1) + 1;
    const zeilenEnde = value.indexOf('\n', ende);
    const bisEnde = zeilenEnde === -1 ? value.length : zeilenEnde;
    const zeilen = value.slice(zeilenStart, bisEnde).split('\n');
    const neuZeilen = zeilen.map(
      (zeile, index) => `${marke(index)}${zeile.replace(LISTENZEILE, '$1$5')}`,
    );
    const neu =
      value.slice(0, zeilenStart) + neuZeilen.join('\n') + value.slice(bisEnde);
    const neuEnde = zeilenStart + neuZeilen.join('\n').length;

    setze(neu, { start: neuEnde, ende: neuEnde });
  };

  const link = () => {
    const element = feld.current;
    const start = element?.selectionStart ?? value.length;
    const ende = element?.selectionEnd ?? value.length;
    const text = value.slice(start, ende) || 'Linktext';
    const marke = `[${text}](https://)`;
    const neu = value.slice(0, start) + marke + value.slice(ende);
    const adresse = start + text.length + 3;

    setze(neu, { start: adresse, ende: adresse + 'https://'.length });
  };

  const erwaehnen = () => {
    const element = feld.current;
    const start = element?.selectionStart ?? value.length;
    const davor = value.slice(0, start);
    const luecke = davor === '' || /\s$/u.test(davor) ? '' : ' ';
    const neu = `${davor}${luecke}@${value.slice(start)}`;
    const ende = start + luecke.length + 1;

    setGeschlossen(false);
    setze(neu, { start: ende, ende });
  };

  const tasten = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (zeigeVorschlaege) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setMarkiert(
          (aktiv + (event.key === 'ArrowDown' ? 1 : -1) + vorschlaege.length) %
            vorschlaege.length,
        );

        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        einsetzen(vorschlaege[aktiv]);

        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setGeschlossen(true);

        return;
      }
    }

    const mitStrg = event.ctrlKey || event.metaKey;

    if (mitStrg && !event.altKey && !event.shiftKey) {
      const taste = event.key.toLowerCase();

      if (taste === 'b' || taste === 'i' || taste === 'k') {
        event.preventDefault();
        event.stopPropagation();

        if (taste === 'b') {
          umschliessen('**');
        } else if (taste === 'i') {
          umschliessen('*');
        } else {
          link();
        }

        return;
      }
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !mitStrg &&
      feld.current !== null &&
      feld.current.selectionStart === feld.current.selectionEnd
    ) {
      const position = feld.current.selectionStart;
      const zeilenStart = value.lastIndexOf('\n', position - 1) + 1;
      const zeile = value.slice(zeilenStart, position);
      const weiter = fortsetzung(zeile);

      if (weiter !== null) {
        event.preventDefault();

        if (weiter.leer) {
          const neu = value.slice(0, zeilenStart) + value.slice(position);

          setze(neu, { start: zeilenStart, ende: zeilenStart });
        } else {
          const einfuegen = `\n${weiter.prefix}`;
          const neu =
            value.slice(0, position) + einfuegen + value.slice(position);
          const ende = position + einfuegen.length;

          setze(neu, { start: ende, ende });
        }

        return;
      }
    }

    onKeyDown?.(event);
  };

  const knopf = (
    beschriftung: ReactNode,
    titel: string,
    aktion: () => void,
  ) => (
    <button
      type="button"
      className="teditor__knopf"
      title={titel}
      aria-label={titel}
      disabled={vorschau}
      onMouseDown={(event) => event.preventDefault()}
      onClick={aktion}
    >
      {beschriftung}
    </button>
  );

  return (
    <div className="teditor">
      <div className="teditor__leiste">
        <div
          role="toolbar"
          aria-label="Formatierung"
          className="teditor__knoepfe"
        >
          {knopf(<IconBold />, 'Fett (Strg+B)', () => umschliessen('**'))}
          {knopf(<IconItalic />, 'Kursiv (Strg+I)', () => umschliessen('*'))}
          {knopf(<IconHeading />, 'Überschrift', () =>
            zeilenAnfang(() => '## '),
          )}
          {knopf(<IconList />, 'Liste', () => zeilenAnfang(() => '- '))}
          {knopf(<IconNumberedList />, 'Nummerierte Liste', () =>
            zeilenAnfang((index) => `${String(index + 1)}. `),
          )}
          {knopf(<IconChecklist />, 'Checkliste', () =>
            zeilenAnfang(() => '- [ ] '),
          )}
          {knopf(<IconLink />, 'Link (Strg+K)', link)}
          {knopf(<IconMention />, 'Person erwähnen', erwaehnen)}
        </div>
        <div
          className="segmented teditor__ansicht"
          role="tablist"
          aria-label="Ansicht"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!vorschau}
            className={
              vorschau ? 'segmented__item' : 'segmented__item is-active'
            }
            onClick={() => setVorschau(false)}
          >
            Schreiben
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vorschau}
            className={
              vorschau ? 'segmented__item is-active' : 'segmented__item'
            }
            onClick={() => setVorschau(true)}
          >
            Vorschau
          </button>
        </div>
      </div>

      {vorschau ? (
        <div className="teditor__vorschau" aria-label={`${label} (Vorschau)`}>
          {value.trim() === '' ? (
            <p className="field__hint">Noch nichts geschrieben.</p>
          ) : (
            <FormatierterText
              text={value}
              onHaken={(nummer) => onChange(schalteHaken(value, nummer))}
            />
          )}
        </div>
      ) : (
        <div className="teditor__feld">
          <textarea
            ref={feld}
            id={feldId}
            rows={rows}
            aria-label={id === undefined ? label : undefined}
            placeholder={placeholder}
            autoFocus={autoFocus}
            value={value}
            aria-autocomplete="list"
            aria-controls={zeigeVorschlaege ? listeId : undefined}
            aria-activedescendant={
              zeigeVorschlaege ? `${listeId}-${String(aktiv)}` : undefined
            }
            onChange={(event) => {
              onChange(event.target.value);
              setCursor(event.target.selectionStart);
              setGeschlossen(false);
            }}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyDown={tasten}
            onBlur={() => setGeschlossen(true)}
            onFocus={() => setGeschlossen(false)}
          />
          <span className="visually-hidden" aria-live="polite">
            {zeigeVorschlaege
              ? `${String(vorschlaege.length)} Personen gefunden, mit Pfeiltasten wählen, Enter übernimmt.`
              : ''}
          </span>
          {zeigeVorschlaege && (
            <ul
              className="teditor__vorschlaege"
              role="listbox"
              id={listeId}
              aria-label="Person erwähnen"
            >
              {vorschlaege.map((person, index) => (
                <li
                  key={person.id}
                  id={`${listeId}-${String(index)}`}
                  role="option"
                  aria-selected={index === aktiv}
                  className={index === aktiv ? 'is-aktiv' : undefined}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    einsetzen(person);
                  }}
                >
                  {person.firstName} {person.lastName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="teditor__hilfe field__hint">
        **fett**, *kursiv*, - Liste, - [ ] Checkliste, @ erwähnt jemanden aus
        dem Team.
      </p>
    </div>
  );
};
