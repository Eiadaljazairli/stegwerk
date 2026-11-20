// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { type CustomFieldFilter } from '../lib/types';
import { useListControls } from '../lib/useListControls';
import { CustomFieldFilters } from './CustomFieldFilters';
import { type Gerendert, rendere } from './testumgebung';

const ALLES_ERLAUBT = {
  myPermissions: {
    everything: true,
    permissions: [],
    feldrechte: [],
  },
};

const START: CustomFieldFilter[] = [
  { key: 'std:city', operator: 'EQUALS', value: 'Kiel' },
  { key: 'std:industry', operator: 'EQUALS', value: 'Bau' },
  { key: 'std:country', operator: 'EQUALS', value: 'Dänemark' },
];

let offen: Gerendert | null = null;
let gesetzt: CustomFieldFilter[] = [];

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

const Filter = () => {
  const controls = useListControls('name');
  const { setCustomFilters } = controls;

  useEffect(() => {
    setCustomFilters(START);
  }, [setCustomFilters]);

  gesetzt = controls.customFilters;

  return <CustomFieldFilters entity="COMPANY" controls={controls} />;
};

const knopf = (text: string) =>
  [...(offen?.container.querySelectorAll('button') ?? [])].find(
    (element) =>
      element.textContent?.startsWith(text) === true ||
      element.getAttribute('aria-label') === text,
  ) as HTMLButtonElement;

const klick = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};

describe('CustomFieldFilters: Chip ändern', () => {
  it('schließt das offene Fenster, wenn eine andere Bedingung wegfällt', async () => {
    offen = await rendere(<Filter />, { daten: ALLES_ERLAUBT });

    await klick(knopf('Branche'));
    expect(
      offen.container
        .querySelector('[role="dialog"]')
        ?.getAttribute('aria-label'),
    ).toBe('Filter ändern: Branche');

    await klick(knopf('Filter entfernen: Stadt ist Kiel'));

    const fenster = offen.container.querySelector('[role="dialog"]');

    if (fenster !== null) {
      expect(fenster.getAttribute('aria-label')).toBe('Filter ändern: Branche');
      await klick(knopf('Übernehmen'));
    }

    expect(gesetzt).toEqual([START[1], START[2]]);
  });
});
