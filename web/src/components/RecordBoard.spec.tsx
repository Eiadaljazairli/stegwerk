// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BoardFeld } from '../lib/recordBoard';
import { RecordBoard } from './RecordBoard';
import { RecordKalender } from './RecordKalender';
import { axeVerstoesse, type Gerendert, rendere } from './testumgebung';

type Karte = { id: string; name: string; status: string | null; tag: string };

const FELD: BoardFeld = {
  key: 'custom:status',
  label: 'Status',
  art: 'auswahl',
  optionen: [
    { wert: 'Neu', label: 'Neu', farbe: 'blau' },
    { wert: 'Aktiv', label: 'Aktiv', farbe: 'gruen' },
  ],
  ohneWert: 'Ohne Status',
};

const KARTEN: Karte[] = [
  { id: 'a', name: 'Alpha GmbH', status: 'Neu', tag: '2026-03-04' },
  { id: 'b', name: 'Beta AG', status: null, tag: '2026-03-05' },
];

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

const taste = async (element: Element, key: string) => {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
};

const ziehe = async (element: Element) => {
  const zeiger = (art: string, x: number) =>
    Object.assign(
      new MouseEvent(art, {
        bubbles: true,
        clientX: x,
        clientY: 300,
        button: 0,
      }),
      { pointerId: 1, pointerType: 'mouse' },
    );

  await act(async () => {
    element.dispatchEvent(zeiger('pointerdown', 0));
    window.dispatchEvent(zeiger('pointermove', 40));
    window.dispatchEvent(zeiger('pointerup', 40));
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
};

const karte = (id: string) =>
  offen?.container.querySelector(`[data-karte-id="${id}"]`) as HTMLElement;

const board = (
  props: Partial<Parameters<typeof RecordBoard<Karte>>[0]> = {},
) => (
  <RecordBoard<Karte>
    kennung="test"
    feld={FELD}
    karten={KARTEN}
    id={(k) => k.id}
    titel={(k) => k.name}
    link={(k) => `/firmen/${k.id}`}
    wert={(k) => k.status}
    darfVerschieben
    verschieben={() => Promise.resolve()}
    weitere={0}
    mehrzahl="Firmen"
    {...props}
  />
);

describe('RecordBoard', () => {
  it('zeigt die Möglichkeiten als Spalten, „ohne“ zuletzt', async () => {
    offen = await rendere(board());

    const spalten = [...offen.container.querySelectorAll('.board__column')].map(
      (spalte) => spalte.getAttribute('aria-label'),
    );

    expect(spalten).toEqual(['Neu, 1', 'Aktiv, 0', 'Ohne Status, 1']);
  });

  it('verschiebt mit Leertaste, Pfeil und Leertaste und sagt es an', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(board({ verschieben }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(verschieben).toHaveBeenCalledWith(KARTEN[0], 'Aktiv');
    expect(offen.container.querySelector('[role="status"]')?.textContent).toBe(
      '„Alpha GmbH“ nach Aktiv verschoben.',
    );
  });

  it('setzt beim Ablegen in „ohne“ den Wert auf leer', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(board({ verschieben }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'End');
    await taste(karte('a'), 'Enter');

    expect(verschieben).toHaveBeenCalledWith(KARTEN[0], null);
  });

  it('verschiebt ohne Recht nichts, lässt aber navigieren', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(board({ verschieben, darfVerschieben: false }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(verschieben).not.toHaveBeenCalled();
    expect(karte('a').getAttribute('aria-roledescription')).toBe('Karte');
  });

  it('bietet der Tastatur nur Spalten an, in die die Karte darf', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(
      board({
        verschieben,
        zielErlaubt: (_karte, ziel) => ziel === '',
      }),
    );

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');

    expect(offen.container.querySelector('[role="status"]')?.textContent).toBe(
      'Ohne Status, Status 2 von 2.',
    );

    await taste(karte('a'), ' ');

    expect(verschieben).toHaveBeenCalledWith(KARTEN[0], null);
  });

  it('kommt mit der Tastatur nicht auf ein verbotenes Ziel', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(board({ verschieben, zielErlaubt: () => false }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(verschieben).not.toHaveBeenCalled();
    expect(offen.container.querySelector('[role="status"]')?.textContent).toBe(
      '„Alpha GmbH“ bleibt in Neu.',
    );
  });

  it('sagt beim Ziehen mit der Maus, warum ein Ziel nicht geht', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(
      board({
        verschieben,
        zielErlaubt: () => false,
        zielVerboten: () => 'Geht nicht zurück.',
      }),
    );

    const ziel = offen.container.querySelector(
      '[data-board-ziel="Aktiv"]',
    ) as HTMLElement;
    const vorher = document.elementFromPoint;

    document.elementFromPoint = () => ziel;

    try {
      await ziehe(karte('a'));
    } finally {
      document.elementFromPoint = vorher;
    }

    expect(verschieben).not.toHaveBeenCalled();
    expect(offen.container.querySelector('[role="status"]')?.textContent).toBe(
      'Geht nicht zurück.',
    );
  });

  it('legt eine abgebrochene Karte still zurück', async () => {
    offen = await rendere(board({ verschieben: () => Promise.resolve(false) }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(
      karte('a').closest('.board__column')?.getAttribute('aria-label'),
    ).toBe('Neu, 1');
  });

  it('hat keine Verstöße gegen die Barrierefreiheit', async () => {
    offen = await rendere(board());

    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });
});

const kalender = (
  props: Partial<Parameters<typeof RecordKalender<Karte>>[0]> = {},
) => (
  <RecordKalender<Karte>
    kennung="test"
    monat="2026-03-01"
    setMonat={() => undefined}
    feldLabel="Vertragsende"
    karten={KARTEN}
    id={(k) => k.id}
    titel={(k) => k.name}
    link={(k) => `/firmen/${k.id}`}
    datum={(k) => k.tag}
    darfVerschieben
    verschieben={() => Promise.resolve()}
    laedt={false}
    weitere={0}
    mehrzahl="Firmen"
    {...props}
  />
);

describe('RecordKalender', () => {
  it('legt die Karten an ihren Tag', async () => {
    offen = await rendere(kalender());

    expect(
      karte('a').closest('[role="group"]')?.getAttribute('aria-label'),
    ).toBe('Mittwoch, 4. März 2026, 1 Eintrag');
  });

  it('verschiebt mit der Tastatur um eine Woche', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(kalender({ verschieben }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowDown');
    await taste(karte('a'), ' ');

    expect(verschieben).toHaveBeenCalledWith(KARTEN[0], '2026-03-11');
  });

  it('nennt an jedem Tag den Wochentag, für die Liste auf dem Handy', async () => {
    offen = await rendere(kalender());

    expect(
      karte('a').closest('[role="group"]')?.querySelector('.rkal__zahl')
        ?.textContent,
    ).toBe('Mi, 4');
  });

  it('legt die Karte zurück, wenn das Speichern scheitert', async () => {
    offen = await rendere(
      kalender({
        verschieben: () => Promise.reject(new Error('Keine Berechtigung.')),
      }),
    );

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(
      karte('a').closest('[role="group"]')?.getAttribute('aria-label'),
    ).toBe('Mittwoch, 4. März 2026, 1 Eintrag');
    expect(offen.container.querySelector('[role="status"]')?.textContent).toBe(
      'Nicht verschoben: Keine Berechtigung.',
    );
  });

  it('zeigt je Tag drei Karten und klappt den Rest auf und zu', async () => {
    const viele: Karte[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      name: `Firma ${id}`,
      status: null,
      tag: '2026-03-10',
    }));

    offen = await rendere(kalender({ karten: viele }));

    const tag = () =>
      offen?.container.querySelector(
        '[aria-label="Dienstag, 10. März 2026, 5 Einträge"]',
      ) as HTMLElement;
    const knopf = (text: string) =>
      [...tag().querySelectorAll('button')].find(
        (eintrag) => eintrag.textContent === text,
      );

    expect(tag().querySelectorAll('.rkal__karte')).toHaveLength(3);

    await act(async () => knopf('+ 2 weitere')?.click());

    expect(tag().querySelectorAll('.rkal__karte')).toHaveLength(5);

    await act(async () => knopf('Weniger')?.click());

    expect(tag().querySelectorAll('.rkal__karte')).toHaveLength(3);
  });

  it('verschiebt ohne Recht nichts', async () => {
    const verschieben = vi.fn(() => Promise.resolve());

    offen = await rendere(kalender({ verschieben, darfVerschieben: false }));

    await taste(karte('a'), ' ');
    await taste(karte('a'), 'ArrowRight');
    await taste(karte('a'), ' ');

    expect(verschieben).not.toHaveBeenCalled();
  });

  it('hat keine Verstöße gegen die Barrierefreiheit', async () => {
    offen = await rendere(kalender());

    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });
});
