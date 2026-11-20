// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordKalender, useKalenderMonat } from './RecordKalender';
import './testumgebung';
import { ToastProvider } from './Toast';

const KalenderMitMonat = () => {
  const [monat, setMonat] = useKalenderMonat();

  return (
    <RecordKalender<{ id: string }>
      kennung="test"
      monat={monat}
      setMonat={setMonat}
      feldLabel="Fällig"
      karten={[]}
      id={(karte) => karte.id}
      titel={(karte) => karte.id}
      link={(karte) => `/aufgaben/${karte.id}`}
      datum={() => null}
      darfVerschieben={false}
      verschieben={() => Promise.resolve()}
      laedt={false}
      weitere={0}
      mehrzahl="Aufgaben"
    />
  );
};

let zone: string | undefined;
let abbauen: (() => void) | null = null;

beforeEach(() => {
  zone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T00:30:00Z'));
});

afterEach(() => {
  abbauen?.();
  abbauen = null;
  vi.useRealTimers();
  process.env.TZ = zone;
});

describe('RecordKalender', () => {
  it('beginnt im Monat und hebt den Tag hervor, der in Deutschland heute ist', async () => {
    expect(new Date().getDate()).toBe(31);

    const container = document.createElement('div');

    document.body.append(container);

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <KalenderMitMonat />
          </ToastProvider>
        </MemoryRouter>,
      );
    });
    abbauen = () => {
      act(() => root.unmount());
      container.remove();
    };

    expect(container.querySelector('.rkal__monat')?.textContent).toMatch(
      /April 2026/u,
    );

    const heute = container.querySelectorAll('.rkal__tag--heute');

    expect(heute).toHaveLength(1);
    expect(heute[0].getAttribute('aria-label')).toMatch(/1\. April/u);
  });
});
