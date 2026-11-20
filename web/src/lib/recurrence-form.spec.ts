import { describe, expect, it } from 'vitest';

import {
  EMPTY_RECURRENCE,
  fromRule,
  nthWeekdayOf,
  type RecurrenceForm,
  toRule,
} from './recurrence-form';

const form = (overrides: Partial<RecurrenceForm> = {}): RecurrenceForm => ({
  ...EMPTY_RECURRENCE,
  ...overrides,
});

describe('aus Feldern eine Regel', () => {
  it('macht aus einmalig gar nichts', () => {
    expect(toRule(form(), '2026-03-16')).toBeNull();
  });

  it('schreibt die einfachen Fälle', () => {
    expect(toRule(form({ mode: 'DAILY' }), '2026-03-16')).toBe('FREQ=DAILY');
    expect(toRule(form({ mode: 'WEEKLY' }), '2026-03-16')).toBe('FREQ=WEEKLY');
    expect(toRule(form({ mode: 'YEARLY' }), '2026-03-16')).toBe('FREQ=YEARLY');
    expect(toRule(form({ mode: 'MONTHLY' }), '2026-03-16')).toBe(
      'FREQ=MONTHLY',
    );
  });

  it('lässt den Abstand weg, wenn er eins ist', () => {
    expect(toRule(form({ mode: 'DAILY', interval: 1 }), '2026-03-16')).toBe(
      'FREQ=DAILY',
    );
    expect(toRule(form({ mode: 'DAILY', interval: 3 }), '2026-03-16')).toBe(
      'FREQ=DAILY;INTERVAL=3',
    );
  });

  it('sortiert die Wochentage', () => {
    expect(
      toRule(form({ mode: 'WEEKLY', weekdays: [4, 0, 2] }), '2026-03-16'),
    ).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('macht aus dem Monatstag einen gezählten Wochentag', () => {
    expect(toRule(form({ mode: 'MONTHLY_WEEKDAY' }), '2026-03-16')).toBe(
      'FREQ=MONTHLY;BYDAY=3MO',
    );
  });

  it('zählt in der letzten Woche von hinten', () => {
    expect(toRule(form({ mode: 'MONTHLY_WEEKDAY' }), '2026-07-31')).toBe(
      'FREQ=MONTHLY;BYDAY=-1FR',
    );
  });

  it('schreibt das Ende', () => {
    expect(
      toRule(
        form({ mode: 'WEEKLY', ends: 'UNTIL', until: '2026-12-31' }),
        '2026-03-16',
      ),
    ).toBe('FREQ=WEEKLY;UNTIL=20261231');

    expect(
      toRule(form({ mode: 'WEEKLY', ends: 'COUNT', count: 8 }), '2026-03-16'),
    ).toBe('FREQ=WEEKLY;COUNT=8');
  });

  it('schreibt kein leeres Ende', () => {
    expect(
      toRule(form({ mode: 'WEEKLY', ends: 'UNTIL', until: '' }), '2026-03-16'),
    ).toBe('FREQ=WEEKLY');
  });

  it('nennt Wochentage nur dort, wo sie etwas bedeuten', () => {
    expect(
      toRule(form({ mode: 'DAILY', weekdays: [0, 2] }), '2026-03-16'),
    ).toBe('FREQ=DAILY');
    expect(
      toRule(form({ mode: 'YEARLY', weekdays: [0, 2] }), '2026-03-16'),
    ).toBe('FREQ=YEARLY');
  });
});

describe('den gezählten Wochentag bestimmen', () => {
  it('zählt von vorne', () => {
    expect(nthWeekdayOf('2026-03-02')).toBe('1MO');
    expect(nthWeekdayOf('2026-03-09')).toBe('2MO');
    expect(nthWeekdayOf('2026-03-16')).toBe('3MO');
  });

  it('zählt den letzten von hinten', () => {
    expect(nthWeekdayOf('2026-03-30')).toBe('-1MO');
    expect(nthWeekdayOf('2026-07-31')).toBe('-1FR');
  });
});

describe('aus einer Regel wieder Felder', () => {
  it('macht aus nichts einmalig', () => {
    expect(fromRule(null)).toEqual(EMPTY_RECURRENCE);
    expect(fromRule('')).toEqual(EMPTY_RECURRENCE);
    expect(fromRule('   ')).toEqual(EMPTY_RECURRENCE);
  });

  it('liest die einfachen Fälle', () => {
    expect(fromRule('FREQ=DAILY').mode).toBe('DAILY');
    expect(fromRule('FREQ=WEEKLY').mode).toBe('WEEKLY');
    expect(fromRule('FREQ=MONTHLY').mode).toBe('MONTHLY');
    expect(fromRule('FREQ=MONTHLY;BYDAY=1MO').mode).toBe('MONTHLY_WEEKDAY');
    expect(fromRule('FREQ=YEARLY').mode).toBe('YEARLY');
  });

  it('liest Abstand, Wochentage und Ende', () => {
    const gelesen = fromRule(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20261231',
    );

    expect(gelesen.interval).toBe(2);
    expect(gelesen.weekdays).toEqual([0, 4]);
    expect(gelesen.ends).toBe('UNTIL');
    expect(gelesen.until).toBe('2026-12-31');
  });

  it('liest die Anzahl', () => {
    const gelesen = fromRule('FREQ=WEEKLY;COUNT=8');

    expect(gelesen.ends).toBe('COUNT');
    expect(gelesen.count).toBe(8);
  });

  it('gibt bei etwas Unbekanntem einmalig zurück, statt zu raten', () => {
    expect(fromRule('FREQ=HOURLY').mode).toBe('NONE');
    expect(fromRule('BYDAY=MO').mode).toBe('NONE');
    expect(fromRule('Unsinn').mode).toBe('NONE');
  });

  it('übersteht Kleinschreibung', () => {
    expect(fromRule('freq=weekly;byday=mo').mode).toBe('WEEKLY');
    expect(fromRule('freq=weekly;byday=mo').weekdays).toEqual([0]);
  });
});

describe('hin und zurück', () => {
  it('kommt heraus, wie es hineinging', () => {
    for (const eingabe of [
      form({ mode: 'DAILY' }),
      form({ mode: 'DAILY', interval: 3 }),
      form({ mode: 'WEEKLY', weekdays: [0, 2, 4] }),
      form({ mode: 'WEEKLY', interval: 2 }),
      form({ mode: 'MONTHLY' }),
      form({ mode: 'YEARLY', interval: 2 }),
      form({ mode: 'WEEKLY', ends: 'UNTIL', until: '2026-12-31' }),
      form({ mode: 'WEEKLY', ends: 'COUNT', count: 8 }),
    ]) {
      const regel = toRule(eingabe, '2026-03-16');

      expect(fromRule(regel)).toEqual(eingabe);
    }
  });

  it('kommt auch beim gezählten Wochentag wieder auf denselben Modus', () => {
    const regel = toRule(form({ mode: 'MONTHLY_WEEKDAY' }), '2026-03-16');

    expect(regel).toBe('FREQ=MONTHLY;BYDAY=3MO');
    expect(fromRule(regel).mode).toBe('MONTHLY_WEEKDAY');
  });
});
