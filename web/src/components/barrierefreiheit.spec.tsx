// @vitest-environment jsdom
import { act, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useListControls } from '../lib/useListControls';
import { EntwicklerPage } from '../pages/EntwicklerPage';
import { FehlerbehebungPage } from '../pages/FehlerbehebungPage';
import { LandingPage } from '../pages/LandingPage';
import { ProduktPage } from '../pages/ProduktPage';
import { AppShell } from './AppShell';
import { ConfirmDialog } from './ConfirmDialog';
import { DealBoard } from './DealBoard';
import { Dialogfenster } from './Dialogfenster';
import { ListTable } from './ListTable';
import { SearchPalette } from './SearchPalette';
import { axeVerstoesse, type Gerendert, rendere } from './testumgebung';

const ALLES_ERLAUBT = {
  myPermissions: {
    everything: true,
    permissions: [],
    feldrechte: [],
  },
};

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
  vi.useRealTimers();
});

const tippe = async (feld: HTMLInputElement, text: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;

    setter?.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const taste = async (ziel: Element, key: string) => {
  await act(async () => {
    ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('die Prüfung selbst', () => {
  it('meldet einen Verstoß, wenn es einen gibt', async () => {
    offen = await rendere(
      <button type="button">
        <img src="/x.png" />
      </button>,
    );

    expect(await axeVerstoesse(offen.container)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^button-name|^image-alt/u),
      ]),
    );
  });
});

describe('Schale', () => {
  it('beginnt mit dem Sprunglink zum Inhalt und hat keine Verstöße', async () => {
    offen = await rendere(
      <AppShell>
        <h1>Übersicht</h1>
      </AppShell>,
      { daten: ALLES_ERLAUBT },
    );

    const erster = offen.container.querySelector('a, button, input');

    expect(erster?.textContent).toBe('Zum Inhalt springen');
    expect(erster?.getAttribute('href')).toBe('#inhalt');

    const inhalt = offen.container.querySelector('#inhalt');

    expect(inhalt?.tagName).toBe('MAIN');
    expect(inhalt?.getAttribute('tabindex')).toBe('-1');
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });
});

describe('Suche', () => {
  it('folgt dem Combobox-Muster und hat keine Verstöße', async () => {
    offen = await rendere(<SearchPalette open onClose={() => {}} />, {
      daten: ALLES_ERLAUBT,
    });

    const dialog = offen.container.querySelector('dialog');
    const feld = offen.container.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );

    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.getAttribute('aria-label')).toBe('Suche');
    expect(feld).not.toBeNull();

    const liste = document.getElementById(
      feld?.getAttribute('aria-controls') ?? '',
    );

    expect(liste?.getAttribute('role')).toBe('listbox');
    expect(feld?.getAttribute('aria-expanded')).toBe('true');

    const aktiv = () =>
      document.getElementById(
        feld?.getAttribute('aria-activedescendant') ?? '',
      );

    expect(aktiv()?.getAttribute('role')).toBe('option');
    expect(aktiv()?.getAttribute('aria-selected')).toBe('true');

    const ersterTreffer = aktiv()?.id;

    if (feld !== null) {
      await taste(feld, 'ArrowDown');
    }

    expect(aktiv()?.id).not.toBe(ersterTreffer);
    expect(
      liste?.querySelectorAll('[role="option"][aria-selected="true"]'),
    ).toHaveLength(1);

    for (const gruppe of liste?.querySelectorAll('[role="group"]') ?? []) {
      expect(
        document.getElementById(gruppe.getAttribute('aria-labelledby') ?? '')
          ?.textContent,
      ).not.toBe('');
    }

    expect(
      offen.container.querySelector('[role="status"][aria-live="polite"]')
        ?.textContent,
    ).toMatch(/Vorschläge$/u);
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  it('findet die Fehlerbehebung und sagt die Treffer an', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    offen = await rendere(<SearchPalette open onClose={() => {}} />, {
      daten: ALLES_ERLAUBT,
    });

    const feld = offen.container.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );

    if (feld !== null) {
      await tippe(feld, 'App-Passwort');
    }

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });

    const optionen = [
      ...offen.container.querySelectorAll('[role="option"]'),
    ].map((option) => option.textContent ?? '');

    expect(optionen.some((text) => text.includes('Fehlerbehebung'))).toBe(true);
    expect(
      offen.container.querySelector('[role="status"][aria-live="polite"]')
        ?.textContent,
    ).toMatch(/Treffer$/u);
  });

  it('schließt mit Escape', async () => {
    const zu = vi.fn();

    offen = await rendere(<SearchPalette open onClose={zu} />, {
      daten: ALLES_ERLAUBT,
    });

    const dialog = offen.container.querySelector('dialog');

    await act(async () => {
      dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
    });

    expect(zu).toHaveBeenCalled();
  });
});

describe('Dialoge', () => {
  it('ConfirmDialog hat keine Verstöße und den Fokus auf Abbrechen', async () => {
    offen = await rendere(
      <ConfirmDialog
        title="Firma löschen?"
        consequence="Aufgaben und Notizen gehen mit."
        confirmLabel="Löschen"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(document.activeElement?.textContent).toBe('Abbrechen');
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  const MitKnopf = ({ onClose }: { onClose?: () => void }) => {
    const [auf, setAuf] = useState(false);

    return (
      <>
        <button type="button" onClick={() => setAuf(true)}>
          Öffnen
        </button>
        {auf && (
          <Dialogfenster
            titel="DATEV-Export"
            onClose={() => {
              onClose?.();
              setAuf(false);
            }}
          >
            <label htmlFor="monat">Monat</label>
            <input id="monat" type="month" />
            <button type="button">Herunterladen</button>
          </Dialogfenster>
        )}
      </>
    );
  };

  it('Dialogfenster: Titel, Fokus ins erste Feld und zurück, Escape', async () => {
    const zu = vi.fn();

    offen = await rendere(<MitKnopf onClose={zu} />);

    const knopf = offen.container.querySelector('button');

    knopf?.focus();
    await act(async () => {
      knopf?.click();
    });

    const dialog = offen.container.querySelector('dialog');

    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(
      document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')
        ?.textContent,
    ).toBe('DATEV-Export');
    expect(document.activeElement?.id).toBe('monat');
    expect(await axeVerstoesse(offen.container)).toEqual([]);

    await act(async () => {
      dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
    });

    expect(zu).toHaveBeenCalledTimes(1);
    expect(offen.container.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(knopf);
  });

  it('Dialogfenster schließt über den Knopf mit Namen', async () => {
    offen = await rendere(<MitKnopf />);

    await act(async () => {
      offen?.container.querySelector('button')?.click();
    });

    const schliessen = offen.container.querySelector(
      'button[aria-label="Schließen"]',
    ) as HTMLButtonElement | null;

    expect(schliessen).not.toBeNull();
    await act(async () => {
      schliessen?.click();
    });
    expect(offen.container.querySelector('dialog')).toBeNull();
  });
});

describe('Board und Liste', () => {
  it('das Board der Geschäfte hat keine Verstöße', async () => {
    offen = await rendere(<DealBoard pipelineId={null} />, {
      daten: {
        ...ALLES_ERLAUBT,
        deals: {
          totalCount: 2,
          hasMore: false,
          items: [
            {
              id: 'd1',
              name: 'Wartung 2027',
              amount: 4800,
              currency: 'EUR',
              stage: 'LEAD',
              pipelineId: null,
              closeDate: null,
              lostReason: null,
              companyId: null,
              company: null,
              owner: null,
              customFields: {},
            },
            {
              id: 'd2',
              name: 'Neubau Halle',
              amount: 12000,
              currency: 'EUR',
              stage: 'PROPOSAL',
              pipelineId: null,
              closeDate: null,
              lostReason: null,
              companyId: null,
              company: null,
              owner: null,
              customFields: {},
            },
          ],
        },
      },
    });

    expect(offen.container.textContent).toContain('Wartung 2027');
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  it('eine Liste hat keine Verstöße', async () => {
    const Liste = () => {
      const controls = useListControls('name');

      return (
        <ListTable
          label="Firmen"
          columns={[
            {
              key: 'name',
              label: 'Name',
              sortField: 'name',
              render: (zeile: { id: string; name: string }) => zeile.name,
            },
            { key: 'ort', label: 'Ort', render: () => 'Kiel' },
          ]}
          rows={[
            { id: '1', name: 'Seewind Logistik GmbH' },
            { id: '2', name: 'Alpenblick AG' },
          ]}
          rowKey={(zeile) => zeile.id}
          controls={controls}
        />
      );
    };

    offen = await rendere(<Liste />);

    expect(offen.container.querySelector('table')).not.toBeNull();
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });
});

describe('öffentliche Seiten', () => {
  it.each([
    ['/'],
    ['/funktionen/e-rechnung'],
    ['/entwickler'],
    ['/entwickler/webhooks'],
    ['/hilfe/fehlerbehebung'],
  ])('%s hat keine Verstöße', async (pfad) => {
    offen = await rendere(
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/funktionen/:slug" element={<ProduktPage />} />
        <Route path="/entwickler" element={<EntwicklerPage />} />
        <Route path="/entwickler/:teil" element={<EntwicklerPage />} />
        <Route path="/hilfe/fehlerbehebung" element={<FehlerbehebungPage />} />
      </Routes>,
      { pfad },
    );

    expect(offen.container.querySelector('h1')).not.toBeNull();
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  it('die Referenz hat keine Verstöße', async () => {
    offen = await rendere(
      <Routes>
        <Route path="/entwickler/:teil" element={<EntwicklerPage />} />
      </Routes>,
      { pfad: '/entwickler/referenz' },
    );

    expect(await axeVerstoesse(offen.container)).toEqual([]);
  }, 30_000);
});
