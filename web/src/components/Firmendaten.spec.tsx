// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Firmendaten } from './Firmendaten';
import { type Gerendert, rendere } from './testumgebung';

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

const warte = () =>
  act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });

const knopf = (text: string) =>
  [...(offen?.container.querySelectorAll('button') ?? [])].find(
    (element) => element.textContent?.trim() === text,
  );

describe('Firmendaten: Impressum erneut lesen', () => {
  it('bietet nach einem Fehler „Erneut lesen“ an und zeigt dann die Vorschau', async () => {
    let versuche = 0;
    const daten: Record<string, unknown> = {};

    Object.defineProperty(daten, 'impressumLesen', {
      enumerable: true,
      get: () => {
        versuche += 1;

        if (versuche === 1) {
          throw new Error(
            'nordwind.de ist nicht erreichbar oder antwortet nicht.',
          );
        }

        return {
          quelle: 'https://nordwind.de/impressum',
          felder: [
            {
              feld: 'phone',
              label: 'Telefon',
              wert: '040 123',
              aktuell: null,
              uebernehmbar: true,
              grund: null,
            },
          ],
        };
      },
    });

    offen = await rendere(
      <Firmendaten
        firma={{ id: 'f-1', name: 'Nordwind', domain: 'nordwind.de' }}
        onChanged={() => {}}
      />,
      { daten },
    );

    await act(async () => knopf('Daten ergänzen')?.click());
    await warte();

    expect(versuche).toBe(1);
    expect(offen.container.textContent).toContain('nicht erreichbar');

    const erneut = knopf('Erneut lesen');

    expect(erneut).toBeDefined();

    await act(async () => erneut?.click());
    await warte();

    expect(versuche).toBe(2);
    expect(offen.container.textContent).not.toContain('nicht erreichbar');
    expect(offen.container.textContent).toContain('040 123');
    expect(knopf('Erneut lesen')).toBeUndefined();
  });
});
