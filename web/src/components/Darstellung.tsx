import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { type Darstellung } from '../lib/ansichtLink';
import {
  type DarstellungsWahl,
  feldZumSpeichern,
  leseDarstellung,
  merkeDarstellung,
} from '../lib/darstellung';
import { CUSTOM_FIELDS } from '../lib/queries';
import {
  AUFGABEN_STATUS_OPTIONEN,
  type BoardFeld,
  optionenDesFelds,
} from '../lib/recordBoard';
import { type CustomField } from '../lib/types';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import { IconBoard, IconCalendar, IconList } from './Icons';
import { personName, useTeam } from './Verantwortlich';

export type ListenArt = 'COMPANY' | 'CONTACT' | 'DEAL' | 'TASK';

export type DatumFeld = { key: string; label: string };

export const useDarstellung = (
  liste: string,
  alt?: { schluessel: string },
): [DarstellungsWahl, (teil: Partial<DarstellungsWahl>) => void] => {
  const [wahl, setWahl] = useState<DarstellungsWahl>(() =>
    leseDarstellung(liste, alt),
  );

  const setzen = (teil: Partial<DarstellungsWahl>) =>
    setWahl((vorher) => {
      const neu = { ...vorher, ...teil };

      merkeDarstellung(liste, neu);

      return neu;
    });

  return [wahl, setzen];
};

const art = (entity: ListenArt) => entity.toLowerCase() as FeldArt;

const standardBoardFelder = (
  entity: ListenArt,
  team: BoardFeld['optionen'],
  branchen: string[],
): BoardFeld[] => {
  const verantwortlich: BoardFeld = {
    key: 'std:ownerId',
    label: 'Verantwortlich',
    art: 'person',
    optionen: team,
    ohneWert: 'Niemand zuständig',
  };

  switch (entity) {
    case 'COMPANY':
      return [
        {
          key: 'std:industry',
          label: 'Branche',
          art: 'text',
          optionen: branchen.map((wert) => ({ wert, label: wert })),
          ohneWert: 'Ohne Branche',
        },
        verantwortlich,
      ];
    case 'CONTACT':
      return [verantwortlich];
    case 'DEAL':
      return [
        {
          key: 'std:stage',
          label: 'Phase',
          art: 'auswahl',
          optionen: [],
          ohneWert: null,
        },
        verantwortlich,
      ];
    case 'TASK':
      return [
        {
          key: 'std:status',
          label: 'Stand',
          art: 'auswahl',
          optionen: AUFGABEN_STATUS_OPTIONEN,
          ohneWert: null,
        },
        {
          key: 'std:assigneeId',
          label: 'Zuständig',
          art: 'person',
          optionen: team,
          ohneWert: null,
        },
      ];
  }
};

export const STANDARD_GRUPPE: Record<ListenArt, string | null> = {
  COMPANY: 'std:industry',
  CONTACT: 'std:ownerId',
  DEAL: 'std:stage',
  TASK: 'std:status',
};

export const STANDARD_DATUM: Record<ListenArt, string | null> = {
  COMPANY: null,
  CONTACT: null,
  DEAL: 'std:closeDate',
  TASK: 'std:dueDate',
};

const STANDARD_DATUMSFELDER: Record<ListenArt, DatumFeld[]> = {
  COMPANY: [],
  CONTACT: [],
  DEAL: [{ key: 'std:closeDate', label: 'Abschluss' }],
  TASK: [{ key: 'std:dueDate', label: 'Fällig' }],
};

export const useDarstellungsFelder = (
  entity: ListenArt,
  branchen: string[] = [],
): {
  boardFelder: BoardFeld[];
  datumFelder: DatumFeld[];
  aenderbar: (key: string) => boolean;
  geladen: boolean;
} => {
  const { data } = useQuery<{ customFields: CustomField[] }>(CUSTOM_FIELDS, {
    variables: { entity },
  });
  const feldrechte = useFeldrechte();
  const team = useTeam().map((person) => ({
    wert: person.id,
    label: personName(person),
  }));
  const sichtbar = (key: string) =>
    key.startsWith('custom:')
      ? feldrechte.eigenes(art(entity), key.slice('custom:'.length)) !==
        'verborgen'
      : feldrechte.standard(art(entity), key.slice('std:'.length)) !==
        'verborgen';
  const eigene = (data?.customFields ?? []).filter(
    (feld) => feld.archivedAt == null,
  );

  return {
    boardFelder: [
      ...standardBoardFelder(entity, team, branchen),
      ...eigene
        .filter((feld) => feld.type === 'SELECT')
        .map(
          (feld): BoardFeld => ({
            key: `custom:${feld.key}`,
            label: feld.label,
            art: 'auswahl',
            optionen: optionenDesFelds(feld),
            ohneWert: `Ohne ${feld.label}`,
          }),
        ),
    ].filter((feld) => sichtbar(feld.key)),
    datumFelder: [
      ...STANDARD_DATUMSFELDER[entity],
      ...eigene
        .filter((feld) => feld.type === 'DATE')
        .map((feld) => ({ key: `custom:${feld.key}`, label: feld.label })),
    ].filter((feld) => sichtbar(feld.key)),
    aenderbar: (key) =>
      feldrechte.aenderbar(
        art(entity),
        key.startsWith('std:') ? key.slice('std:'.length) : key,
      ),
    geladen: data !== undefined && feldrechte.geladen,
  };
};

const SCHALTER: { art: Darstellung; label: string; icon: typeof IconList }[] = [
  { art: 'liste', label: 'Liste', icon: IconList },
  { art: 'board', label: 'Board', icon: IconBoard },
  { art: 'kalender', label: 'Kalender', icon: IconCalendar },
];

export const DarstellungSchalter = ({
  wert,
  onChange,
  arten = ['liste', 'board', 'kalender'],
}: {
  wert: Darstellung;
  onChange: (art: Darstellung) => void;
  arten?: Darstellung[];
}) => (
  <div className="view-switch" role="group" aria-label="Darstellung">
    {SCHALTER.filter(({ art: knopf }) => arten.includes(knopf)).map(
      ({ art: knopf, label, icon: Icon }) => (
        <button
          key={knopf}
          type="button"
          className={
            wert === knopf
              ? 'view-switch__option is-active'
              : 'view-switch__option'
          }
          aria-pressed={wert === knopf}
          onClick={() => onChange(knopf)}
        >
          <Icon size={14} />
          {label}
        </button>
      ),
    )}
  </div>
);

export const DarstellungsFeldWahl = ({
  art: darstellung,
  felder,
  wert,
  standard,
  onChange,
}: {
  art: 'board' | 'kalender';
  felder: { key: string; label: string }[];
  wert: string | null;
  standard: string | null;
  onChange: (feld: string | null) => void;
}) =>
  felder.length === 0 ? null : (
    <select
      className="toolbar__filter"
      aria-label={
        darstellung === 'board' ? 'Spalten des Boards' : 'Datum des Kalenders'
      }
      value={wert ?? ''}
      onChange={(event) =>
        onChange(feldZumSpeichern(event.target.value, standard))
      }
    >
      {felder.map((feld) => (
        <option key={feld.key} value={feld.key}>
          {darstellung === 'board'
            ? `Spalten nach ${feld.label}`
            : `Kalender nach ${feld.label}`}
        </option>
      ))}
    </select>
  );
