// @vitest-environment jsdom
import { gql } from '@apollo/client';
import { act, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useListControls } from '../lib/useListControls';
import { ListTable } from './ListTable';
import { type Auswahl } from './Sammelleiste';
import { type Gerendert, rendere } from './testumgebung';

type Zeile = { id: string; name: string };

const FRAGMENT = gql`
  fragment TestZeile on Company {
    id
    name
  }
`;

let offen: Gerendert | null = null;
let gewaehlt = new Set<string>();

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
  gewaehlt = new Set();
});

const Liste = () => {
  const controls = useListControls('name');
  const [pipelineId, setPipelineId] = useState('a');
  const [auswahlSatz, setAuswahlSatz] = useState<Set<string>>(new Set());
  const auswahl: Auswahl = {
    gewaehlt: auswahlSatz,
    setzen: (ids) => {
      gewaehlt = ids;
      setAuswahlSatz(ids);
    },
    leeren: () => setAuswahlSatz(new Set()),
  };

  return (
    <>
      <button type="button" onClick={() => setPipelineId('b')}>
        Pipeline B
      </button>
      <ListTable<Zeile>
        label="Geschäfte"
        columns={[
          { key: 'name', label: 'Name', render: (zeile) => zeile.name },
        ]}
        rows={
          pipelineId === 'a'
            ? [{ id: 'a1', name: 'Wartung A' }]
            : [{ id: 'b1', name: 'Wartung B' }]
        }
        rowKey={(zeile) => zeile.id}
        controls={controls}
        auswahl={auswahl}
        zuruecksetzenBei={{ pipelineId }}
        neueZeile={{
          label: 'Neues Geschäft',
          platzhalter: 'Bezeichnung',
          fragment: FRAGMENT,
          anlegen: async (name) => ({ id: 'neu', name }),
        }}
      />
    </>
  );
};

const knopf = (text: string) =>
  [...(offen?.container.querySelectorAll('button') ?? [])].find((element) =>
    element.textContent?.includes(text),
  ) as HTMLButtonElement;

const klick = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
};

const tippe = async (feld: HTMLInputElement, text: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set?.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('ListTable: angeheftete neue Zeilen', () => {
  it('fallen weg, wenn sich die Eingrenzung der Seite ändert', async () => {
    offen = await rendere(<Liste />);

    await klick(knopf('Neues Geschäft'));
    const feld = offen.container.querySelector(
      'input[aria-label="Bezeichnung"]',
    ) as HTMLInputElement;

    await tippe(feld, 'Test');
    await act(async () => {
      feld.form?.requestSubmit();
      await new Promise((fertig) => setTimeout(fertig, 0));
    });

    const zeilen = () =>
      [
        ...(offen?.container.querySelectorAll(
          'tbody:not(.list-table__neu) tr',
        ) ?? []),
      ].map((zeile) => zeile.textContent ?? '');

    expect(zeilen().some((text) => text.includes('Test'))).toBe(true);

    await klick(knopf('Pipeline B'));

    expect(zeilen().some((text) => text.includes('Test'))).toBe(false);
    expect(zeilen().some((text) => text.includes('Wartung B'))).toBe(true);

    await klick(
      offen.container.querySelector(
        'input[aria-label="Alle auf dieser Seite auswählen"]',
      ) as HTMLInputElement,
    );

    expect([...gewaehlt]).toEqual(['b1']);
  });
});
