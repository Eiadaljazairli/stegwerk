import { describe, expect, it } from 'vitest';

import { aufgabenStandFilter, istView, viewFilters } from './aufgabenStand';

describe('aufgabenStandFilter', () => {
  it('filtert in der Liste nach dem gewählten Reiter', () => {
    expect(aufgabenStandFilter('liste', 'open')).toEqual(viewFilters('open'));
    expect(aufgabenStandFilter('liste', 'overdue')).toEqual({
      overdue: true,
      completed: null,
      status: null,
    });
  });

  it('filtert in Board und Kalender nicht nach dem ausgeblendeten Reiter', () => {
    const alle = { overdue: null, completed: null, status: null };

    for (const view of ['open', 'inArbeit', 'overdue', 'done'] as const) {
      expect(aufgabenStandFilter('board', view)).toEqual(alle);
      expect(aufgabenStandFilter('kalender', view)).toEqual(alle);
    }
  });

  it('erkennt nur bekannte Reiter', () => {
    expect(istView('done')).toBe(true);
    expect(istView('alle')).toBe(false);
  });
});
