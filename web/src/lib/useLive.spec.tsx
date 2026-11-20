// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import '../components/testumgebung';

const client = {
  mutate: vi.fn(async () => ({ data: { liveTicket: 'karte' } })),
  refetchQueries: vi.fn(() => Promise.resolve([])),
};

vi.mock('@apollo/client', async (original) => ({
  ...(await original<typeof import('@apollo/client')>()),
  useApolloClient: () => client,
}));

class FalscherStrom {
  static CLOSED = 2;
  static alle: FalscherStrom[] = [];
  readyState = 1;
  onerror: (() => void) | null = null;
  private zuhoerer = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(readonly url: string) {
    FalscherStrom.alle.push(this);
  }

  addEventListener(art: string, fn: (e: MessageEvent) => void) {
    this.zuhoerer.set(art, [...(this.zuhoerer.get(art) ?? []), fn]);
  }

  senden(art: string, daten = '{}') {
    for (const fn of this.zuhoerer.get(art) ?? []) {
      fn({ data: daten } as MessageEvent);
    }
  }

  close() {
    this.readyState = FalscherStrom.CLOSED;
  }
}

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  FalscherStrom.alle = [];
  client.mutate.mockClear();
  client.refetchQueries.mockClear();
  vi.stubGlobal('EventSource', FalscherStrom);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const starten = async () => {
  const { useLiveVerbindung } = await import('./useLive');
  const Huelle = () => {
    useLiveVerbindung('bereich-1');

    return null;
  };

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Huelle />));
};

const weiter = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

it('öffnet beim Wechsel den neuen Strom, bevor der alte geht, und lädt nicht alles nach', async () => {
  await starten();

  const [erster] = FalscherStrom.alle;

  erster.senden('bereit');
  erster.senden('wechsel');
  await weiter(0);

  expect(FalscherStrom.alle).toHaveLength(2);
  expect(erster.readyState).not.toBe(FalscherStrom.CLOSED);

  FalscherStrom.alle[1].senden('bereit');
  await weiter(1_000);

  expect(erster.readyState).toBe(FalscherStrom.CLOSED);
  expect(client.refetchQueries).not.toHaveBeenCalled();

  erster.onerror?.();
  await weiter(60_000);

  expect(FalscherStrom.alle).toHaveLength(2);
});

it('lädt nach einem Abbruch beim nächsten „bereit“ alles nach', async () => {
  await starten();

  const [erster] = FalscherStrom.alle;

  erster.senden('bereit');
  erster.onerror?.();
  await weiter(2_000);

  expect(FalscherStrom.alle).toHaveLength(2);

  FalscherStrom.alle[1].senden('bereit');
  await weiter(1_000);

  expect(client.refetchQueries).toHaveBeenCalledTimes(1);
});

it('verbindet sich nach „verdraengt“ nicht gleich wieder, sondern erst, wenn das Fenster zurückkommt', async () => {
  await starten();

  const [erster] = FalscherStrom.alle;

  erster.senden('bereit');
  erster.senden('verdraengt');
  erster.onerror?.();
  await weiter(60_000);

  expect(erster.readyState).toBe(FalscherStrom.CLOSED);
  expect(FalscherStrom.alle).toHaveLength(1);

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(FalscherStrom.alle).toHaveLength(2);

  FalscherStrom.alle[1].senden('bereit');
  await weiter(1_000);

  expect(client.refetchQueries).toHaveBeenCalledTimes(1);
});
