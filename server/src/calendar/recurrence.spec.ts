import { berlinTime, instantFromBerlin } from './berlin-time';
import {
  addDays,
  addMonths,
  describeRule,
  formatRule,
  isRealDay,
  occurrencesBetween,
  parseRule,
  weekdayOf,
} from './recurrence';

const fenster = (from: string, to: string) => ({ from, to });

describe('Tage rechnen', () => {
  it('rückt Tage über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-16', 7)).toBe('2026-03-23');
  });

  it('rückt über die Zeitumstellung, ohne zu verrutschen', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('rückt Monate und behält den Tag', () => {
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('zählt Wochentage ab Montag', () => {
    expect(weekdayOf('2026-03-16')).toBe(0);
    expect(weekdayOf('2026-03-22')).toBe(6);
  });

  it('erkennt Tage, die es nicht gibt', () => {
    expect(isRealDay('2026-02-28')).toBe(true);
    expect(isRealDay('2026-02-29')).toBe(false);
    expect(isRealDay('2028-02-29')).toBe(true);
    expect(isRealDay('2026-04-31')).toBe(false);
    expect(isRealDay('16.03.2026')).toBe(false);
  });
});

describe('eine Regel lesen', () => {
  it('liest die einfachste Regel', () => {
    expect(parseRule('FREQ=WEEKLY')).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byDay: [],
      until: null,
      count: null,
    });
  });

  it('liest Abstand, Wochentage und Ende', () => {
    expect(
      parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231'),
    ).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: [
        { weekday: 0, nth: null },
        { weekday: 2, nth: null },
      ],
      until: '2026-12-31',
      count: null,
    });
  });

  it('liest den ersten und den letzten Wochentag im Monat', () => {
    expect(parseRule('FREQ=MONTHLY;BYDAY=1MO').byDay).toEqual([
      { weekday: 0, nth: 1 },
    ]);
    expect(parseRule('FREQ=MONTHLY;BYDAY=-1FR').byDay).toEqual([
      { weekday: 4, nth: -1 },
    ]);
  });

  it('nimmt ein Ende mit Uhrzeit an und behält nur den Tag', () => {
    expect(parseRule('FREQ=DAILY;UNTIL=20261231T225959Z').until).toBe(
      '2026-12-31',
    );
  });

  it('weist ab, was sie nicht sicher versteht', () => {
    for (const unsinn of [
      'FREQ=HOURLY',
      'FREQ=WEEKLY;BYSETPOS=-1',
      'FREQ=WEEKLY;BYMONTHDAY=13',
      'FREQ=WEEKLY;WKST=SU',
      'INTERVAL=2',
      'FREQ=WEEKLY;INTERVAL=0',
      'FREQ=WEEKLY;INTERVAL=-1',
      'FREQ=WEEKLY;BYDAY=MONTAG',
      'FREQ=WEEKLY;COUNT=0',
      'FREQ=DAILY;UNTIL=20260231',
      'FREQ=DAILY;UNTIL=Weihnachten',
      'WEEKLY',
      '',
    ]) {
      expect(() => parseRule(unsinn)).toThrow();
    }
  });

  it('lässt Ende und Anzahl nicht zusammen zu', () => {
    expect(() => parseRule('FREQ=WEEKLY;UNTIL=20261231;COUNT=5')).toThrow(
      'nicht beides',
    );
  });

  it('weist dieselbe Angabe zweimal ab', () => {
    expect(() => parseRule('FREQ=WEEKLY;INTERVAL=2;INTERVAL=3')).toThrow(
      'zweimal',
    );
  });

  it('lässt Wochentage nur dort zu, wo sie etwas bedeuten', () => {
    expect(() => parseRule('FREQ=DAILY;BYDAY=MO')).toThrow('nur wöchentlich');
    expect(() => parseRule('FREQ=YEARLY;BYDAY=MO')).toThrow('nur wöchentlich');
    expect(() => parseRule('FREQ=WEEKLY;BYDAY=1MO')).toThrow('ersten Montag');
    expect(() => parseRule('FREQ=MONTHLY;BYDAY=MO,TU')).toThrow(
      'nur ein Wochentag',
    );
  });

  it('begrenzt die Zählung eines Wochentags', () => {
    for (const unsinn of ['0MO', '6MO', '-6FR', '9MO']) {
      expect(() => parseRule(`FREQ=MONTHLY;BYDAY=${unsinn}`)).toThrow();
    }

    expect(parseRule('FREQ=MONTHLY;BYDAY=5MO').byDay[0].nth).toBe(5);
    expect(parseRule('FREQ=MONTHLY;BYDAY=-5MO').byDay[0].nth).toBe(-5);
  });

  it('kommt wieder heraus, wie es hineinging', () => {
    for (const text of [
      'FREQ=DAILY',
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=DI'.replace('DI', 'TU'),
      'FREQ=MONTHLY;BYDAY=1MO',
      'FREQ=MONTHLY;BYDAY=-1FR',
      'FREQ=YEARLY;INTERVAL=2',
      'FREQ=WEEKLY;UNTIL=20261231',
      'FREQ=WEEKLY;COUNT=10',
    ]) {
      expect(formatRule(parseRule(text))).toBe(text);
    }
  });
});

describe('die Regel auf Deutsch', () => {
  const sag = (text: string, startDay = '2026-03-16'): string =>
    describeRule(parseRule(text), startDay);

  it('sagt, was gemeint ist', () => {
    expect(sag('FREQ=DAILY')).toBe('Täglich');
    expect(sag('FREQ=DAILY;INTERVAL=3')).toBe('Alle 3 Tage');
    expect(sag('FREQ=YEARLY')).toBe('Jährlich');
  });

  it('nennt den Wochentag des ersten Termins, wenn keiner dasteht', () => {
    expect(sag('FREQ=WEEKLY')).toBe('Jeden Montag');
  });

  it('zählt mehrere Wochentage auf', () => {
    expect(sag('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe(
      'Jeden Montag, Mittwoch und Freitag',
    );
  });

  it('nennt den Abstand', () => {
    expect(sag('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toBe(
      'Alle 2 Wochen am Dienstag',
    );
  });

  it('spricht den Monatstermin aus, statt ihn zu buchstabieren', () => {
    expect(sag('FREQ=MONTHLY;BYDAY=1MO')).toBe('Monatlich am ersten Montag');
    expect(sag('FREQ=MONTHLY;BYDAY=-1FR')).toBe('Monatlich am letzten Freitag');
    expect(sag('FREQ=MONTHLY;INTERVAL=3;BYDAY=2DI'.replace('DI', 'TU'))).toBe(
      'Alle 3 Monate am zweiten Dienstag',
    );
    expect(sag('FREQ=MONTHLY')).toBe('Monatlich am 16.');
  });

  it('sagt, wann Schluss ist', () => {
    expect(sag('FREQ=WEEKLY;UNTIL=20261231')).toBe(
      'Jeden Montag, bis 31.12.2026',
    );
    expect(sag('FREQ=WEEKLY;COUNT=8')).toBe('Jeden Montag, 8 Mal');
  });
});

describe('die Tage einer Serie', () => {
  const tage = (
    text: string,
    startDay: string,
    from: string,
    to: string,
    skip?: string[],
  ): string[] =>
    occurrencesBetween(parseRule(text), startDay, fenster(from, to), { skip });

  it('nimmt den ersten Termin immer mit', () => {
    expect(
      tage('FREQ=WEEKLY', '2026-03-16', '2026-03-01', '2026-03-31')[0],
    ).toBe('2026-03-16');
  });

  it('zählt wöchentlich weiter', () => {
    expect(
      tage('FREQ=WEEKLY', '2026-03-16', '2026-03-01', '2026-04-15'),
    ).toEqual([
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
      '2026-04-06',
      '2026-04-13',
    ]);
  });

  it('nimmt bei mehreren Wochentagen jeden davon', () => {
    expect(
      tage('FREQ=WEEKLY;BYDAY=MO,WE', '2026-03-16', '2026-03-01', '2026-03-29'),
    ).toEqual(['2026-03-16', '2026-03-18', '2026-03-23', '2026-03-25']);
  });

  it('lässt bei jeder zweiten Woche eine aus', () => {
    expect(
      tage('FREQ=WEEKLY;INTERVAL=2', '2026-03-16', '2026-03-01', '2026-04-30'),
    ).toEqual(['2026-03-16', '2026-03-30', '2026-04-13', '2026-04-27']);
  });

  it('beginnt nicht vor dem ersten Termin, auch wenn der Wochentag passt', () => {
    expect(
      tage('FREQ=WEEKLY;BYDAY=MO,WE', '2026-03-18', '2026-03-01', '2026-03-25'),
    ).toEqual(['2026-03-18', '2026-03-23', '2026-03-25']);
  });

  it('zählt täglich', () => {
    expect(
      tage('FREQ=DAILY;INTERVAL=2', '2026-03-16', '2026-03-16', '2026-03-22'),
    ).toEqual(['2026-03-16', '2026-03-18', '2026-03-20', '2026-03-22']);
  });

  it('hält bei einer Anzahl an, auch außerhalb des Fensters', () => {
    expect(
      tage('FREQ=WEEKLY;COUNT=3', '2026-03-16', '2026-03-01', '2026-12-31'),
    ).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);

    expect(
      tage('FREQ=WEEKLY;COUNT=3', '2026-03-16', '2026-04-01', '2026-12-31'),
    ).toEqual([]);
  });

  it('hält an einem Tag an', () => {
    expect(
      tage(
        'FREQ=WEEKLY;UNTIL=20260330',
        '2026-03-16',
        '2026-03-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);
  });

  it('zählt ausgelassene Termine mit', () => {
    expect(
      tage('FREQ=WEEKLY;COUNT=3', '2026-03-16', '2026-03-01', '2026-12-31', [
        '2026-03-23',
      ]),
    ).toEqual(['2026-03-16', '2026-03-30']);
  });

  it('liefert monatlich denselben Tag', () => {
    expect(
      tage('FREQ=MONTHLY', '2026-03-15', '2026-03-01', '2026-06-30'),
    ).toEqual(['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15']);
  });

  it('lässt Monate aus, in denen es den Tag nicht gibt', () => {
    expect(
      tage('FREQ=MONTHLY', '2026-01-31', '2026-01-01', '2026-05-31'),
    ).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('findet den ersten Montag im Monat', () => {
    expect(
      tage('FREQ=MONTHLY;BYDAY=1MO', '2026-03-02', '2026-03-01', '2026-06-30'),
    ).toEqual(['2026-03-02', '2026-04-06', '2026-05-04', '2026-06-01']);
  });

  it('findet den letzten Freitag im Monat', () => {
    expect(
      tage('FREQ=MONTHLY;BYDAY=-1FR', '2026-03-27', '2026-03-01', '2026-06-30'),
    ).toEqual(['2026-03-27', '2026-04-24', '2026-05-29', '2026-06-26']);
  });

  it('zählt jährlich', () => {
    expect(
      tage('FREQ=YEARLY', '2026-03-16', '2026-01-01', '2029-12-31'),
    ).toEqual(['2026-03-16', '2027-03-16', '2028-03-16', '2029-03-16']);
  });

  it('lässt den 29. Februar in Jahren aus, in denen es ihn nicht gibt', () => {
    expect(
      tage('FREQ=YEARLY', '2028-02-29', '2028-01-01', '2036-12-31'),
    ).toEqual(['2028-02-29', '2032-02-29', '2036-02-29']);
  });

  it('lässt in der letzten Woche nichts über das Fensterende hinausragen', () => {
    expect(
      tage('FREQ=WEEKLY;BYDAY=MO,FR', '2026-04-06', '2026-04-20', '2026-04-30'),
    ).toEqual(['2026-04-20', '2026-04-24', '2026-04-27']);
  });

  it('zählt einen doppelt genannten Wochentag nur einmal', () => {
    expect(
      tage('FREQ=WEEKLY;BYDAY=MO,MO', '2026-03-16', '2026-03-01', '2026-03-31'),
    ).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);
  });

  it('lässt bei jedem zweiten Monat einen aus', () => {
    expect(
      tage('FREQ=MONTHLY;INTERVAL=2', '2026-03-15', '2026-03-01', '2026-10-31'),
    ).toEqual(['2026-03-15', '2026-05-15', '2026-07-15', '2026-09-15']);
  });

  it('lässt bei jedem zweiten Jahr eines aus', () => {
    expect(
      tage('FREQ=YEARLY;INTERVAL=2', '2026-03-16', '2026-01-01', '2032-12-31'),
    ).toEqual(['2026-03-16', '2028-03-16', '2030-03-16', '2032-03-16']);
  });

  it('findet den letzten Freitag auch, wenn er der Monatsletzte ist', () => {
    expect(
      tage('FREQ=MONTHLY;BYDAY=-1FR', '2026-07-31', '2026-07-01', '2026-09-30'),
    ).toEqual(['2026-07-31', '2026-08-28', '2026-09-25']);
  });

  it('beginnt auch monatlich nicht vor dem ersten Termin', () => {
    expect(
      tage('FREQ=MONTHLY;BYDAY=1MO', '2026-03-20', '2026-03-01', '2026-05-31'),
    ).toEqual(['2026-04-06', '2026-05-04']);
  });

  it('zeigt nur, was im Fenster liegt', () => {
    expect(
      tage('FREQ=WEEKLY', '2026-03-16', '2026-04-01', '2026-04-30'),
    ).toEqual(['2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27']);
  });

  it('lässt abgesagte Einzeltermine weg', () => {
    expect(
      tage('FREQ=WEEKLY', '2026-03-16', '2026-03-01', '2026-04-06', [
        '2026-03-23',
        '2026-03-30',
      ]),
    ).toEqual(['2026-03-16', '2026-04-06']);
  });

  it('bleibt bei einer endlosen Serie stehen, statt weiterzulaufen', () => {
    const viele = tage('FREQ=DAILY', '2020-01-01', '2020-01-01', '2099-12-31');

    expect(viele.length).toBeLessThanOrEqual(750);
    expect(viele[0]).toBe('2020-01-01');
  });
});

describe('die Serie und die Zeitumstellung', () => {
  it('bleibt im Frühjahr bei derselben Uhrzeit', () => {
    const tage = occurrencesBetween(
      parseRule('FREQ=WEEKLY'),
      '2026-03-16',
      fenster('2026-03-01', '2026-04-15'),
    );

    const zeiten = tage.map((tag) =>
      berlinTime(instantFromBerlin(tag, '09:00')),
    );

    expect(new Set(zeiten)).toEqual(new Set(['09:00']));

    expect(instantFromBerlin('2026-03-23', '09:00').toISOString()).toBe(
      '2026-03-23T08:00:00.000Z',
    );
    expect(instantFromBerlin('2026-03-30', '09:00').toISOString()).toBe(
      '2026-03-30T07:00:00.000Z',
    );
  });

  it('bleibt im Herbst bei derselben Uhrzeit', () => {
    const tage = occurrencesBetween(
      parseRule('FREQ=WEEKLY'),
      '2026-10-19',
      fenster('2026-10-01', '2026-11-15'),
    );

    for (const tag of tage) {
      expect(berlinTime(instantFromBerlin(tag, '09:00'))).toBe('09:00');
    }

    expect(instantFromBerlin('2026-10-19', '09:00').toISOString()).toBe(
      '2026-10-19T07:00:00.000Z',
    );
    expect(instantFromBerlin('2026-10-26', '09:00').toISOString()).toBe(
      '2026-10-26T08:00:00.000Z',
    );
  });

  it('trifft auch eine tägliche Serie über die Umstellung', () => {
    const tage = occurrencesBetween(
      parseRule('FREQ=DAILY'),
      '2026-03-27',
      fenster('2026-03-27', '2026-03-31'),
    );

    expect(tage).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]);

    for (const tag of tage) {
      expect(berlinTime(instantFromBerlin(tag, '09:00'))).toBe('09:00');
    }
  });
});
