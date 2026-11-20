import { describe, expect, it } from 'vitest';

import { PARAMETER, standLesen } from './ansichtLink';
import { balkenLink, type KachelFuerLink, zeitraumAus } from './kachelLink';

const kachel = (teil: Partial<KachelFuerLink>): KachelFuerLink => ({
  objekt: 'deal',
  gruppe: 'phase',
  status: null,
  pipelineId: null,
  nurMeine: false,
  zeitraum: null,
  ...teil,
});

const stand = (link: string | null) => {
  expect(link).not.toBeNull();

  const url = new URL(link as string, 'https://example.test');

  return { pfad: url.pathname, ...standLesen(url.searchParams.get(PARAMETER)) };
};

describe('balkenLink', () => {
  it('öffnet die Phase mit Status, Pipeline und „Meine“', () => {
    const ergebnis = stand(
      balkenLink(
        kachel({ status: 'offen', pipelineId: 'p1', nurMeine: true }),
        'LEAD',
      ),
    );

    expect(ergebnis.pfad).toBe('/geschaefte');
    expect(ergebnis.filters).toEqual({
      stage: 'LEAD',
      pipelineId: 'p1',
      verantwortlich: 'me',
    });
  });

  it('übersetzt Status ohne Phasengruppe für die Liste', () => {
    expect(
      stand(
        balkenLink(
          kachel({ gruppe: 'herkunft', status: 'gewonnen' }),
          'import',
        ),
      ).filters,
    ).toEqual({ stage: 'WON' });
    expect(
      stand(balkenLink(kachel({ gruppe: 'herkunft', status: 'lead' }), 'api'))
        .filters,
    ).toEqual({ stage: 'LEAD' });
  });

  it('filtert Branche über die Firma, leer als „ist leer“', () => {
    expect(
      stand(balkenLink(kachel({ gruppe: 'branche' }), 'Bau')).customFilters,
    ).toEqual([
      { key: 'std:firma.industry', operator: 'EQUALS', value: 'Bau' },
    ]);
    expect(
      stand(balkenLink(kachel({ objekt: 'company', gruppe: 'branche' }), ''))
        .customFilters,
    ).toEqual([{ key: 'std:industry', operator: 'IS_EMPTY' }]);
  });

  it('macht aus einem Quartal einen Datumsbereich', () => {
    const ergebnis = stand(
      balkenLink(
        kachel({ objekt: 'contact', gruppe: 'quartal', zeitraum: '365' }),
        '2026-Q4',
      ),
    );

    expect(ergebnis.pfad).toBe('/kontakte');
    expect(ergebnis.customFilters).toEqual([
      { key: 'std:createdAt', operator: 'IN_LAST_DAYS', value: '365' },
      { key: 'std:createdAt', operator: 'GREATER_THAN', value: '2026-09-30' },
      { key: 'std:createdAt', operator: 'LESS_THAN', value: '2027-01-01' },
    ]);
  });

  it('zählt Gewonnenes am Abschluss, sonst an der letzten Änderung', () => {
    expect(
      stand(
        balkenLink(
          kachel({ gruppe: 'monat', status: 'gewonnen', zeitraum: 'jahr' }),
          '2026-02',
          new Date(2026, 5, 1),
        ),
      ).customFilters,
    ).toEqual([
      {
        key: 'std:abgeschlossen',
        operator: 'GREATER_THAN',
        value: '2025-12-31',
      },
      {
        key: 'std:abgeschlossen',
        operator: 'GREATER_THAN',
        value: '2026-01-31',
      },
      { key: 'std:abgeschlossen', operator: 'LESS_THAN', value: '2026-03-01' },
    ]);
  });

  it('eigenes Auswahlfeld und Verlustgrund', () => {
    expect(
      stand(balkenLink(kachel({ gruppe: 'feld:quelle' }), 'Messe'))
        .customFilters,
    ).toEqual([{ key: 'quelle', operator: 'EQUALS', value: 'Messe' }]);

    const verlust = stand(
      balkenLink(kachel({ gruppe: 'verlustgrund' }), 'Preis'),
    );

    expect(verlust.filters).toEqual({ stage: 'LOST' });
    expect(verlust.customFilters).toEqual([
      { key: 'std:lostReason', operator: 'EQUALS', value: 'Preis' },
    ]);
  });

  it('zählt Verlustgründe ohne Status wie „verloren“, am Abschluss', () => {
    const verlust = stand(
      balkenLink(kachel({ gruppe: 'verlustgrund', zeitraum: '90' }), 'Preis'),
    );

    expect(verlust.filters).toEqual({ stage: 'LOST' });
    expect(verlust.customFilters).toEqual([
      { key: 'std:abgeschlossen', operator: 'IN_LAST_DAYS', value: '90' },
      { key: 'std:lostReason', operator: 'EQUALS', value: 'Preis' },
    ]);
    expect(
      stand(
        balkenLink(
          kachel({ gruppe: 'verlustgrund', status: 'alle', zeitraum: '30' }),
          'Preis',
        ),
      ).customFilters,
    ).toContainEqual({
      key: 'std:abgeschlossen',
      operator: 'IN_LAST_DAYS',
      value: '30',
    });
    expect(
      balkenLink(kachel({ gruppe: 'verlustgrund', status: 'offen' }), 'Preis'),
    ).toBeNull();
  });

  it('verlinkt „alle Pipelines“ nur, wenn es eine einzige gibt', () => {
    const jetzt = new Date(2026, 5, 1);

    expect(balkenLink(kachel({}), 'LEAD', jetzt, 2)).toBeNull();
    expect(balkenLink(kachel({}), 'LEAD', jetzt, 0)).toBeNull();
    expect(
      stand(balkenLink(kachel({ pipelineId: 'p1' }), 'LEAD', jetzt, 0)).filters,
    ).toEqual({ stage: 'LEAD', pipelineId: 'p1' });
    expect(stand(balkenLink(kachel({}), 'LEAD', jetzt, 1)).filters).toEqual({
      stage: 'LEAD',
    });
    expect(
      stand(balkenLink(kachel({ pipelineId: 'p1' }), 'LEAD', jetzt, 2)).filters,
    ).toEqual({ stage: 'LEAD', pipelineId: 'p1' });
    expect(
      balkenLink(
        kachel({ objekt: 'company', gruppe: 'branche' }),
        'Bau',
        jetzt,
        2,
      ),
    ).not.toBeNull();
  });

  it('gibt keinen Link, wo die Liste nicht passt', () => {
    expect(balkenLink(kachel({ objekt: 'task' }), 'x')).toBeNull();
    expect(balkenLink(kachel({ gruppe: 'verantwortlich' }), '')).toBeNull();
    expect(balkenLink(kachel({}), '__andere')).toBeNull();
    expect(balkenLink(kachel({ gruppe: 'woche' }), 'kaputt')).toBeNull();
  });
});

describe('zeitraumAus', () => {
  it('kennt Woche, Monat, Quartal und Jahr', () => {
    expect(zeitraumAus('woche', '2026-12-28')).toEqual({
      von: new Date(2026, 11, 28),
      bis: new Date(2027, 0, 4),
    });
    expect(zeitraumAus('monat', '2026-12')?.bis).toEqual(new Date(2027, 0, 1));
    expect(zeitraumAus('jahr', '2026')?.von).toEqual(new Date(2026, 0, 1));
    expect(zeitraumAus('quartal', '2026-Q5')).toBeNull();
  });
});
