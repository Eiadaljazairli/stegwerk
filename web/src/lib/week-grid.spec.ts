import { describe, expect, it } from 'vitest';

import {
  blockOn,
  layoutDay,
  MINUTES_PER_DAY,
  minutesOf,
  nowMinutes,
  type Placeable,
  visibleHours,
  weekDays,
  weekLabel,
} from './week-grid';

const termin = (overrides: Partial<Placeable> & { id: string }): Placeable => ({
  startDate: '2026-03-16',
  startTime: '09:00',
  endDate: '2026-03-16',
  endTime: '10:00',
  allDay: false,
  ...overrides,
});

describe('Uhrzeiten in Minuten', () => {
  it('rechnet die üblichen Fälle', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('23:59')).toBe(1439);
  });

  it('nimmt eine einstellige Stunde an', () => {
    expect(minutesOf('9:30')).toBe(570);
  });

  it('gibt bei Unsinn null zurück, statt den Termin verschwinden zu lassen', () => {
    for (const unsinn of ['', 'neun', '25:00', '09:60', '09-30', '9']) {
      expect(minutesOf(unsinn)).toBe(0);
    }
  });

  it('nimmt keine Uhrzeit an, die irgendwo mitten im Text steht', () => {
    for (const unsinn of [
      ' 09:30',
      '09:30 ',
      'um 09:30',
      '09:30 Uhr',
      '109:30',
    ]) {
      expect(minutesOf(unsinn)).toBe(0);
    }
  });
});

describe('die Woche', () => {
  it('beginnt am Montag', () => {
    expect(weekDays('2026-03-18')[0]).toBe('2026-03-16');
    expect(weekDays('2026-03-16')[0]).toBe('2026-03-16');
    expect(weekDays('2026-03-22')[0]).toBe('2026-03-16');
  });

  it('hat sieben Tage und endet am Sonntag', () => {
    const days = weekDays('2026-03-18');

    expect(days).toHaveLength(7);
    expect(days[6]).toBe('2026-03-22');
  });

  it('kommt über den Monatswechsel', () => {
    expect(weekDays('2026-04-01')).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
    ]);
  });

  it('nennt die Woche auf Deutsch', () => {
    expect(weekLabel('2026-03-18')).toBe('16.–22. März 2026');
  });

  it('nennt beide Monate, wenn die Woche über den Wechsel geht', () => {
    expect(weekLabel('2026-04-01')).toBe('30. März – 5. April 2026');
  });
});

describe('wo ein Termin steht', () => {
  it('setzt ihn an seine Uhrzeit', () => {
    expect(blockOn(termin({ id: 'a' }), '2026-03-16')).toEqual({
      top: 540,
      height: 60,
    });
  });

  it('lässt ihn an einem fremden Tag weg', () => {
    expect(blockOn(termin({ id: 'a' }), '2026-03-17')).toBeNull();
    expect(blockOn(termin({ id: 'a' }), '2026-03-15')).toBeNull();
  });

  it('lässt ganztägige Termine weg', () => {
    expect(blockOn(termin({ id: 'a', allDay: true }), '2026-03-16')).toBeNull();
  });

  it('beschneidet einen Termin über Mitternacht auf beiden Tagen', () => {
    const nacht = termin({
      id: 'a',
      startDate: '2026-03-20',
      startTime: '22:00',
      endDate: '2026-03-21',
      endTime: '02:00',
    });

    expect(blockOn(nacht, '2026-03-20')).toEqual({ top: 1320, height: 120 });
    expect(blockOn(nacht, '2026-03-21')).toEqual({ top: 0, height: 120 });
  });

  it('füllt einen mittleren Tag ganz aus', () => {
    const lang = termin({
      id: 'a',
      startDate: '2026-03-16',
      startTime: '22:00',
      endDate: '2026-03-18',
      endTime: '02:00',
    });

    expect(blockOn(lang, '2026-03-17')).toEqual({
      top: 0,
      height: MINUTES_PER_DAY,
    });
  });

  it('lässt einen Termin, der um Mitternacht endet, ganz auf dem Vortag', () => {
    const bisMitternacht = termin({
      id: 'a',
      startDate: '2026-03-16',
      startTime: '22:00',
      endDate: '2026-03-17',
      endTime: '00:00',
    });

    expect(blockOn(bisMitternacht, '2026-03-16')).toEqual({
      top: 1320,
      height: 120,
    });
    expect(blockOn(bisMitternacht, '2026-03-17')).toBeNull();
  });

  it('zeichnet am kurzen Tag nach der Uhr und nicht nach der vergangenen Zeit', () => {
    const umstellung = termin({
      id: 'a',
      startDate: '2026-03-29',
      startTime: '01:00',
      endDate: '2026-03-29',
      endTime: '04:00',
    });

    expect(blockOn(umstellung, '2026-03-29')).toEqual({ top: 60, height: 180 });
  });
});

describe('nebeneinander anordnen', () => {
  const spalten = (items: Placeable[]): string[] =>
    layoutDay(items, '2026-03-16').map(
      (entry) =>
        `${entry.item.id}:${String(entry.column)}/${String(entry.columns)}`,
    );

  it('lässt einen einzelnen Termin die volle Breite', () => {
    expect(spalten([termin({ id: 'a' })])).toEqual(['a:0/1']);
  });

  it('stellt zwei überschneidende nebeneinander', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '09:30', endTime: '10:30' }),
      ]),
    ).toEqual(['a:0/2', 'b:1/2']);
  });

  it('stellt zwei aneinandergrenzende untereinander', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '10:00', endTime: '11:00' }),
      ]),
    ).toEqual(['a:0/1', 'b:0/1']);
  });

  it('teilt die Breite unter dreien, die sich alle berühren', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '12:00' }),
        termin({ id: 'b', startTime: '09:30', endTime: '11:00' }),
        termin({ id: 'c', startTime: '10:00', endTime: '11:30' }),
      ]),
    ).toEqual(['a:0/3', 'b:1/3', 'c:2/3']);
  });

  it('lässt neben einem Termin keine Lücke, die niemand braucht', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '09:30', endTime: '11:00' }),
        termin({ id: 'c', startTime: '10:30', endTime: '11:30' }),
      ]),
    ).toEqual(['a:0/2', 'b:1/2', 'c:0/2']);
  });

  it('trennt zwei Gruppen, die sich nicht berühren', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '09:30', endTime: '10:30' }),
        termin({ id: 'c', startTime: '14:00', endTime: '15:00' }),
      ]),
    ).toEqual(['a:0/2', 'b:1/2', 'c:0/1']);
  });

  it('gibt eine frei gewordene Spalte wieder her', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '09:00', endTime: '12:00' }),
        termin({ id: 'c', startTime: '10:00', endTime: '11:00' }),
      ]),
    ).toEqual(['b:0/2', 'a:1/2', 'c:1/2']);
  });

  it('macht einen Termin nicht schmal, neben dem nichts steht', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        termin({ id: 'b', startTime: '10:00', endTime: '11:00' }),
        termin({ id: 'c', startTime: '10:30', endTime: '11:30' }),
      ]),
    ).toEqual(['a:0/1', 'b:0/2', 'c:1/2']);
  });

  it('behält den längsten Termin als Klammer über die ganze Gruppe', () => {
    expect(
      spalten([
        termin({ id: 'a', startTime: '09:00', endTime: '12:00' }),
        termin({ id: 'b', startTime: '09:15', endTime: '09:45' }),
        termin({ id: 'd', startTime: '09:30', endTime: '10:00' }),
        termin({ id: 'c', startTime: '11:00', endTime: '12:00' }),
      ]),
    ).toEqual(['a:0/3', 'b:1/3', 'd:2/3', 'c:1/3']);
  });

  it('ordnet gleich beginnende Termine immer gleich', () => {
    const eins = spalten([
      termin({ id: 'b', startTime: '09:00', endTime: '10:00' }),
      termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
    ]);
    const zwei = spalten([
      termin({ id: 'a', startTime: '09:00', endTime: '10:00' }),
      termin({ id: 'b', startTime: '09:00', endTime: '10:00' }),
    ]);

    expect(eins).toEqual(zwei);
  });

  it('lässt ganztägige Termine draußen', () => {
    expect(
      spalten([termin({ id: 'a' }), termin({ id: 'b', allDay: true })]),
    ).toEqual(['a:0/1']);
  });

  it('kommt mit einem leeren Tag zurecht', () => {
    expect(layoutDay([], '2026-03-16')).toEqual([]);
  });
});

describe('welche Stunden gezeigt werden', () => {
  it('zeigt den üblichen Arbeitstag, wenn nichts ansteht', () => {
    expect(visibleHours([], ['2026-03-16'])).toEqual({ from: 7, to: 20 });
  });

  it('macht früh auf, wenn jemand früh anfängt', () => {
    expect(
      visibleHours(
        [termin({ id: 'a', startTime: '06:15', endTime: '07:00' })],
        ['2026-03-16'],
      ),
    ).toEqual({ from: 6, to: 20 });
  });

  it('macht spät zu, wenn jemand spät aufhört', () => {
    expect(
      visibleHours(
        [termin({ id: 'a', startTime: '20:00', endTime: '22:30' })],
        ['2026-03-16'],
      ),
    ).toEqual({ from: 7, to: 23 });
  });

  it('bleibt innerhalb des Tages', () => {
    const nacht = termin({
      id: 'a',
      startDate: '2026-03-16',
      startTime: '23:00',
      endDate: '2026-03-17',
      endTime: '02:00',
    });

    expect(visibleHours([nacht], ['2026-03-16', '2026-03-17'])).toEqual({
      from: 0,
      to: 24,
    });
  });

  it('bleibt innerhalb des Tages, auch bei einem unsinnigen Vorgabewert', () => {
    expect(visibleHours([], ['2026-03-16'], { from: -3, to: 30 })).toEqual({
      from: 0,
      to: 24,
    });
  });

  it('sieht sich alle Tage der Woche an und nicht nur den ersten', () => {
    expect(
      visibleHours(
        [
          termin({
            id: 'a',
            startDate: '2026-03-19',
            endDate: '2026-03-19',
            startTime: '06:00',
            endTime: '07:00',
          }),
        ],
        weekDays('2026-03-16'),
      ),
    ).toEqual({ from: 6, to: 20 });
  });
});

describe('der Strich für die aktuelle Uhrzeit', () => {
  it('richtet sich nach der deutschen Uhr', () => {
    expect(nowMinutes(new Date('2026-03-16T08:30:00Z'))).toBe(570);
    expect(nowMinutes(new Date('2026-07-16T08:30:00Z'))).toBe(630);
  });

  it('zeigt Mitternacht als null', () => {
    expect(nowMinutes(new Date('2026-03-15T23:00:00Z'))).toBe(0);
  });
});
