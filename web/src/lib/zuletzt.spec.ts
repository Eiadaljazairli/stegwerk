import { describe, expect, it } from 'vitest';

import { bezeichnungenAus, STANDARD_BEZEICHNUNGEN } from './bezeichnung';
import { artDesBesuchs, objektDesBesuchs } from './zuletzt';

const patienten = bezeichnungenAus([
  {
    art: 'KONTAKT',
    einzahl: 'Patient',
    mehrzahl: 'Patienten',
    genus: 'MAENNLICH',
    istStandard: false,
    standardEinzahl: 'Kontakt',
    standardMehrzahl: 'Kontakte',
  },
]);

describe('Zuletzt geöffnet', () => {
  it('liest das Objekt am Pfad ab', () => {
    expect(objektDesBesuchs({ to: '/kontakte/1', title: 'A', art: 'x' })).toBe(
      'KONTAKT',
    );
    expect(objektDesBesuchs({ to: '/angebote/2', title: 'A', art: 'x' })).toBe(
      'ANGEBOT',
    );
    expect(
      objektDesBesuchs({ to: '/rechnungen/3', title: 'A', art: 'x' }),
    ).toBeUndefined();
  });

  it('zeigt die heutige Bezeichnung, auch für alte Einträge', () => {
    const alt = { to: '/kontakte/1', title: 'Erika Muster', art: 'Kontakt' };

    expect(artDesBesuchs(alt, patienten)).toBe('Patient');

    expect(
      artDesBesuchs({ ...alt, art: 'Patient' }, STANDARD_BEZEICHNUNGEN),
    ).toBe('Kontakt');
  });

  it('lässt andere Seiten beim gemerkten Wort', () => {
    expect(
      artDesBesuchs(
        { to: '/rechnungen/3', title: 'RE-1', art: 'Rechnung' },
        patienten,
      ),
    ).toBe('Rechnung');
  });
});
