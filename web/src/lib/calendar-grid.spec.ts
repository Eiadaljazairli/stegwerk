import { describe, expect, it } from 'vitest';

import {
  dayLabel,
  daysOf,
  isSameMonth,
  isWeekend,
  monthGrid,
  monthLabel,
  shiftDay,
  shiftMonth,
  startOfMonth,
  todayInBerlin,
  weekdayIndex,
} from './calendar-grid';

describe('einen Tag verschieben', () => {
  it('geht vorwärts und rückwärts', () => {
    expect(shiftDay('2026-03-15', 1)).toBe('2026-03-16');
    expect(shiftDay('2026-03-15', -1)).toBe('2026-03-14');
  });

  it('kommt über einen Monatswechsel', () => {
    expect(shiftDay('2026-03-31', 1)).toBe('2026-04-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('kennt den Februar eines Schaltjahrs', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('lässt sich von der Zeitumstellung nicht verschieben', () => {
    expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29');
    expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDay('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('der Wochentag', () => {
  it('zählt ab Montag', () => {
    expect(weekdayIndex('2026-03-16')).toBe(0);
    expect(weekdayIndex('2026-03-17')).toBe(1);
    expect(weekdayIndex('2026-03-21')).toBe(5);
    expect(weekdayIndex('2026-03-22')).toBe(6);
  });

  it('sieht Samstag und Sonntag als Wochenende', () => {
    expect(isWeekend('2026-03-20')).toBe(false);
    expect(isWeekend('2026-03-21')).toBe(true);
    expect(isWeekend('2026-03-22')).toBe(true);
    expect(isWeekend('2026-03-23')).toBe(false);
  });
});

describe('Monate', () => {
  it('findet den Monatsanfang', () => {
    expect(startOfMonth('2026-03-15')).toBe('2026-03-01');
  });

  it('blättert vorwärts und rückwärts', () => {
    expect(shiftMonth('2026-03-15', 1)).toBe('2026-04-01');
    expect(shiftMonth('2026-03-15', -1)).toBe('2026-02-01');
  });

  it('kommt über den Jahreswechsel', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-01-15', -13)).toBe('2024-12-01');
    expect(shiftMonth('2026-12-15', 13)).toBe('2028-01-01');
  });

  it('erkennt, ob ein Tag zum Monat gehört', () => {
    expect(isSameMonth('2026-03-31', '2026-03-01')).toBe(true);
    expect(isSameMonth('2026-04-01', '2026-03-01')).toBe(false);
    expect(isSameMonth('2025-03-15', '2026-03-01')).toBe(false);
  });
});

describe('das Raster', () => {
  it('hat immer sechs volle Wochen', () => {
    for (const month of [
      '2026-02-01',
      '2026-03-01',
      '2026-08-01',
      '2027-01-01',
    ]) {
      expect(monthGrid(month)).toHaveLength(42);
    }
  });

  it('beginnt am Montag', () => {
    for (const month of ['2026-02-01', '2026-03-01', '2026-11-01']) {
      expect(weekdayIndex(monthGrid(month)[0])).toBe(0);
    }
  });

  it('zeigt die letzten Tage des Vormonats mit', () => {
    const grid = monthGrid('2026-03-01');

    expect(grid[0]).toBe('2026-02-23');
    expect(grid[6]).toBe('2026-03-01');
  });

  it('fängt am Monatsanfang an, wenn der ein Montag ist', () => {
    expect(monthGrid('2026-06-01')[0]).toBe('2026-06-01');
  });

  it('enthält jeden Tag des Monats genau einmal', () => {
    const grid = monthGrid('2026-03-01');
    const eigene = grid.filter((day) => isSameMonth(day, '2026-03-01'));

    expect(eigene).toHaveLength(31);
    expect(new Set(eigene).size).toBe(31);
  });

  it('läuft lückenlos durch', () => {
    const grid = monthGrid('2026-10-01');

    for (let index = 1; index < grid.length; index += 1) {
      expect(grid[index]).toBe(shiftDay(grid[index - 1], 1));
    }
  });

  it('nimmt jeden Tag des Monats als Ausgangspunkt', () => {
    expect(monthGrid('2026-03-17')).toEqual(monthGrid('2026-03-01'));
  });
});

describe('Beschriftungen', () => {
  it('nennt den Monat auf Deutsch', () => {
    expect(monthLabel('2026-03-01')).toBe('März 2026');
    expect(monthLabel('2026-12-01')).toBe('Dezember 2026');
  });

  it('nennt den Tag mit Wochentag', () => {
    expect(dayLabel('2026-03-15')).toBe('Sonntag, 15. März 2026');
  });
});

describe('der heutige Tag', () => {
  it('richtet sich nach der deutschen Uhr', () => {
    expect(todayInBerlin(new Date('2026-03-15T23:30:00Z'))).toBe('2026-03-16');
    expect(todayInBerlin(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15');
  });
});

describe('die Tage eines Termins', () => {
  it('nennt den einen Tag eines gewöhnlichen Termins', () => {
    expect(
      daysOf({ startDate: '2026-03-15', endDate: '2026-03-15', allDay: false }),
    ).toEqual(['2026-03-15']);
  });

  it('nennt jeden Tag eines mehrtägigen', () => {
    expect(
      daysOf({ startDate: '2026-03-15', endDate: '2026-03-17', allDay: false }),
    ).toEqual(['2026-03-15', '2026-03-16', '2026-03-17']);
  });

  it('zählt beim ganztägigen den Folgetag nicht mit', () => {
    expect(
      daysOf({ startDate: '2026-03-15', endDate: '2026-03-16', allDay: true }),
    ).toEqual(['2026-03-15']);

    expect(
      daysOf({ startDate: '2026-03-15', endDate: '2026-03-18', allDay: true }),
    ).toEqual(['2026-03-15', '2026-03-16', '2026-03-17']);
  });

  it('kommt mit einem ganztägigen zurecht, der auf einem Tag steht', () => {
    expect(
      daysOf({ startDate: '2026-03-15', endDate: '2026-03-15', allDay: true }),
    ).toEqual(['2026-03-15']);
  });

  it('gibt bei einem verdrehten Termin auf, statt hängenzubleiben', () => {
    const days = daysOf({
      startDate: '2026-03-15',
      endDate: '2026-03-10',
      allDay: false,
    });

    expect(days).toEqual(['2026-03-15']);
  });
});
