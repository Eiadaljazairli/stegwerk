// @vitest-environment jsdom
import { act } from 'react';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { merkeBesuch } from '../lib/zuletzt';
import { SearchPalette } from './SearchPalette';
import { type Gerendert, rendere } from './testumgebung';

const ALLES_ERLAUBT = {
  myPermissions: {
    everything: true,
    permissions: [],
    feldrechte: [],
  },
  suche: [
    {
      art: 'firma',
      rang: 1,
      firma: { id: 'f-2', name: 'Müller Bau', industry: null, city: null },
      kontakt: null,
      geschaeft: null,
    },
  ],
};

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
  window.localStorage.clear();
});

const Ort = () => <output data-testid="ort">{useLocation().pathname}</output>;

const tippe = async (feld: HTMLInputElement, text: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set?.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const enter = async (feld: HTMLInputElement) => {
  await act(async () => {
    feld.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
};

const oeffne = async (zu: () => void) => {
  merkeBesuch({ to: '/firmen/f-1', title: 'Seewind GmbH', art: 'Firma' });
  offen = await rendere(
    <>
      <SearchPalette open onClose={zu} />
      <Ort />
    </>,
    { daten: ALLES_ERLAUBT },
  );

  return offen.container.querySelector(
    'input[role="combobox"]',
  ) as HTMLInputElement;
};

const ort = () =>
  offen?.container.querySelector('[data-testid="ort"]')?.textContent;

describe('SearchPalette: Enter', () => {
  it('öffnet sofort nach dem Tippen den passenden Befehl', async () => {
    const zu = vi.fn();
    const feld = await oeffne(zu);

    await tippe(feld, 'neue aufgabe');
    await enter(feld);

    expect(ort()).toBe('/aufgaben');
    expect(zu).toHaveBeenCalled();
  });

  it('wartet nach sofortigem Enter auf die Treffer des Servers', async () => {
    const zu = vi.fn();
    const feld = await oeffne(zu);

    await tippe(feld, 'müller');
    await enter(feld);
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });

    expect(ort()).toBe('/firmen/f-2');
    expect(zu).toHaveBeenCalled();
  });

  it('verhält sich nach der Entprellung wie bisher', async () => {
    const feld = await oeffne(() => {});

    await tippe(feld, 'neue aufgabe');
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 300));
    });
    await enter(feld);

    expect(ort()).toBe('/aufgaben');
  });

  it('öffnet ohne Suchbegriff den ersten Vorschlag', async () => {
    const feld = await oeffne(() => {});

    await enter(feld);

    expect(ort()).toBe('/firmen/f-1');
  });
});
