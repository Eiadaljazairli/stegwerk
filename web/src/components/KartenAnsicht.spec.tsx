// @vitest-environment jsdom
import {
  ApolloClient,
  ApolloLink,
  ApolloProvider,
  InMemoryCache,
} from '@apollo/client';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shiftDay, startOfMonth, todayInBerlin } from '../lib/calendar-grid';
import { kalenderZeitraum } from '../lib/kalenderZiehen';
import { TASKS } from '../lib/queries';
import { type BoardFeld } from '../lib/recordBoard';
import { type Task } from '../lib/types';
import { DarstellungsFeldWahl } from './Darstellung';
import { KARTEN_GRENZE, ListenBoard, ListenKalender } from './KartenAnsicht';
import { axeVerstoesse, testClient } from './testumgebung';
import { ToastProvider } from './Toast';

type TasksData = {
  tasks: { items: Task[]; totalCount: number; hasMore: boolean };
};

const heute = todayInBerlin();

const AUFGABEN = [
  { id: 't1', title: 'Angebot nachfassen', status: 'offen', dueDate: heute },
  { id: 't2', title: 'Rückruf', status: 'in_arbeit', dueDate: null },
];

let abbauen: (() => Promise<void>) | null = null;
let container: HTMLElement;

afterEach(async () => {
  await abbauen?.();
  abbauen = null;
});

const rendere = async (ui: ReactNode) => {
  const variablen: Record<string, unknown>[] = [];
  const merken = new ApolloLink((operation, weiter) => {
    variablen.push(operation.variables);

    return weiter(operation);
  });
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: merken.concat(
      testClient({
        tasks: { items: AUFGABEN, totalCount: 5, hasMore: false },
      }).link,
    ),
  });

  container = document.createElement('div');
  document.body.append(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ApolloProvider client={client}>
        <MemoryRouter>
          <ToastProvider>{ui}</ToastProvider>
        </MemoryRouter>
      </ApolloProvider>,
    );
  });
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });

  abbauen = async () => {
    await act(async () => root.unmount());
    container.remove();
  };

  return variablen;
};

const taste = async (element: Element, key: string) => {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
};

const karte = (id: string) =>
  container.querySelector(`[data-karte-id="${id}"]`) as HTMLElement;

const gemeinsam = (
  speichern: (
    karte: Task,
    aenderung: Record<string, unknown>,
  ) => Promise<unknown>,
) => ({
  kennung: 'aufgaben',
  query: TASKS,
  variablen: { search: '', assigneeId: 'u1', completed: null },
  seite: (daten: TasksData) => daten.tasks,
  titel: (task: Task) => task.title,
  link: (task: Task) => `/aufgaben?aufgabe=${task.id}`,
  speichern,
  darfAendern: true,
  mehrzahl: 'Aufgaben',
});

const ZUSTAENDIG: BoardFeld = {
  key: 'std:assigneeId',
  label: 'Zuständig',
  art: 'person',
  optionen: [
    { wert: 'u1', label: 'Anna' },
    { wert: 'u2', label: 'Ben' },
  ],
  ohneWert: null,
};

describe('ListenBoard', () => {
  it('fragt mit den Filtern der Liste bis zur Grenze, ohne Zeitraum', async () => {
    const variablen = await rendere(
      <ListenBoard<Task, TasksData>
        {...gemeinsam(() => Promise.resolve())}
        feld={ZUSTAENDIG}
      />,
    );

    expect(variablen[0]).toMatchObject({
      assigneeId: 'u1',
      zeitraum: null,
      limit: KARTEN_GRENZE,
      offset: 0,
    });
    expect(container.textContent).toContain(
      'Das Board zeigt die ersten 2 Aufgaben; 3 weitere',
    );
  });

  it('speichert beim Ablegen die Änderung des Felds', async () => {
    const speichern = vi.fn(
      (_task: Task, _aenderung: Record<string, unknown>) => Promise.resolve(),
    );

    await rendere(
      <ListenBoard<Task, TasksData>
        {...gemeinsam(speichern)}
        feld={{
          ...ZUSTAENDIG,
          key: 'std:status',
          art: 'auswahl',
          optionen: [
            { wert: 'offen', label: 'Offen' },
            { wert: 'in_arbeit', label: 'In Arbeit' },
          ],
        }}
        sonderweg={(task, wert) => speichern(task, { status: wert })}
      />,
    );

    await taste(karte('t1'), ' ');
    await taste(karte('t1'), 'ArrowRight');
    await taste(karte('t1'), ' ');

    expect(speichern).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      { status: 'in_arbeit' },
    );
  });

  it('sagt, wenn sich ein Feld so nicht setzen lässt', async () => {
    const speichern = vi.fn(() => Promise.resolve());

    await rendere(
      <ListenBoard<Task, TasksData>
        {...gemeinsam(speichern)}
        feld={{ ...ZUSTAENDIG, ohneWert: 'Niemand' }}
      />,
    );

    await taste(karte('t1'), ' ');
    await taste(karte('t1'), 'End');
    await taste(karte('t1'), ' ');

    expect(speichern).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Nicht verschoben: „Zuständig“ lässt sich so nicht setzen.',
    );
  });
});

describe('ListenKalender', () => {
  it('fragt nur den sichtbaren Zeitraum des Datumsfelds', async () => {
    const variablen = await rendere(
      <ListenKalender<Task, TasksData>
        {...gemeinsam(() => Promise.resolve())}
        feld={{ key: 'std:dueDate', label: 'Fällig' }}
      />,
    );

    expect(variablen[0]).toMatchObject({
      assigneeId: 'u1',
      zeitraum: { feld: 'std:dueDate' },
      limit: KARTEN_GRENZE,
    });
    const zeitraum = variablen[0].zeitraum as { von: string; bis: string };

    expect(zeitraum.von <= heute && heute <= zeitraum.bis).toBe(true);
    expect(karte('t1')).not.toBeNull();
    expect(karte('t2')).toBeNull();
  });

  it('speichert beim Verschieben den neuen Tag', async () => {
    const speichern = vi.fn(() => Promise.resolve());

    await rendere(
      <ListenKalender<Task, TasksData>
        {...gemeinsam(speichern)}
        feld={{ key: 'std:dueDate', label: 'Fällig' }}
      />,
    );

    const { bis } = kalenderZeitraum(startOfMonth(heute));
    const vor = shiftDay(heute, 7) <= bis;

    await taste(karte('t1'), ' ');
    await taste(karte('t1'), vor ? 'ArrowDown' : 'ArrowUp');
    await taste(karte('t1'), ' ');

    expect(speichern).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      { dueDate: shiftDay(heute, vor ? 7 : -7) },
    );
  });
});

describe('DarstellungsFeldWahl', () => {
  const FELDER = [
    { key: 'std:status', label: 'Stand' },
    { key: 'custom:phase', label: 'Phase' },
  ];

  it('nennt jedes Feld und speichert das Standardfeld als keine Angabe', async () => {
    const onChange = vi.fn();

    await rendere(
      <DarstellungsFeldWahl
        art="board"
        felder={FELDER}
        wert="custom:phase"
        standard="std:status"
        onChange={onChange}
      />,
    );

    const auswahl = container.querySelector('select') as HTMLSelectElement;

    expect(auswahl.getAttribute('aria-label')).toBe('Spalten des Boards');
    expect([...auswahl.options].map((option) => option.text)).toEqual([
      'Spalten nach Stand',
      'Spalten nach Phase',
    ]);

    await act(async () => {
      auswahl.value = 'std:status';
      auswahl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(null);

    await act(async () => {
      auswahl.value = 'custom:phase';
      auswahl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith('custom:phase');
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it('zeigt ohne Felder nichts', async () => {
    await rendere(
      <DarstellungsFeldWahl
        art="kalender"
        felder={[]}
        wert={null}
        standard={null}
        onChange={() => undefined}
      />,
    );

    expect(container.querySelector('select')).toBeNull();
  });
});
