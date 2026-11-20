import { describe, expect, it } from 'vitest';

import {
  daysFromPixels,
  isDrag,
  MIN_MINUTES,
  minutesFromPixels,
  moveLabel,
  movedTo,
  resizedTo,
  snap,
  type Span,
} from './drag-move';

const span = (overrides: Partial<Span> = {}): Span => ({
  startDate: '2026-03-16',
  startTime: '09:00',
  endDate: '2026-03-16',
  endTime: '10:00',
  ...overrides,
});

describe('einrasten', () => {
  it('rundet auf die Viertelstunde', () => {
    expect(snap(0)).toBe(0);
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(22)).toBe(15);
    expect(snap(23)).toBe(30);
  });

  it('rastet auch nach unten ein', () => {
    expect(snap(-7)).toBe(-0);
    expect(snap(-8)).toBe(-15);
    expect(snap(-38)).toBe(-45);
  });

  it('nimmt eine andere Schrittweite an', () => {
    expect(snap(17, 30)).toBe(30);
    expect(snap(14, 30)).toBe(0);
  });
});

describe('Klick oder Ziehen', () => {
  it('hält ein Wackeln für einen Klick', () => {
    expect(isDrag({ x: 100, y: 100 }, { x: 101, y: 102 })).toBe(false);
    expect(isDrag({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
  });

  it('hält eine deutliche Bewegung für ein Ziehen', () => {
    expect(isDrag({ x: 100, y: 100 }, { x: 100, y: 110 })).toBe(true);
    expect(isDrag({ x: 100, y: 100 }, { x: 90, y: 100 })).toBe(true);
  });

  it('zählt in beide Richtungen', () => {
    expect(isDrag({ x: 100, y: 100 }, { x: 96, y: 100 })).toBe(true);
    expect(isDrag({ x: 100, y: 100 }, { x: 100, y: 96 })).toBe(true);
  });
});

describe('verschieben', () => {
  it('rückt die Uhrzeit', () => {
    expect(movedTo(span(), { days: 0, minutes: 60 })).toEqual(
      span({ startTime: '10:00', endTime: '11:00' }),
    );
  });

  it('rückt den Tag', () => {
    expect(movedTo(span(), { days: 2, minutes: 0 })).toEqual({
      startDate: '2026-03-18',
      startTime: '09:00',
      endDate: '2026-03-18',
      endTime: '10:00',
    });
  });

  it('rastet die Uhrzeit ein', () => {
    expect(movedTo(span(), { days: 0, minutes: 7 })).toEqual(span());
    expect(movedTo(span(), { days: 0, minutes: 8 })).toEqual(
      span({ startTime: '09:15', endTime: '10:15' }),
    );
  });

  it('behält die Länge', () => {
    const lang = span({ startTime: '09:00', endTime: '12:30' });
    const verschoben = movedTo(lang, { days: 1, minutes: 90 });

    expect(verschoben).toEqual({
      startDate: '2026-03-17',
      startTime: '10:30',
      endDate: '2026-03-17',
      endTime: '14:00',
    });
  });

  it('hält einen Termin über Mitternacht zusammen', () => {
    const nacht = span({
      startDate: '2026-03-20',
      startTime: '22:00',
      endDate: '2026-03-21',
      endTime: '02:00',
    });

    expect(movedTo(nacht, { days: 0, minutes: 60 })).toEqual({
      startDate: '2026-03-20',
      startTime: '23:00',
      endDate: '2026-03-21',
      endTime: '03:00',
    });
  });

  it('schiebt einen Termin über Mitternacht auf den nächsten Tag', () => {
    const abend = span({ startTime: '23:00', endTime: '23:30' });

    expect(movedTo(abend, { days: 0, minutes: 120 })).toEqual({
      startDate: '2026-03-17',
      startTime: '01:00',
      endDate: '2026-03-17',
      endTime: '01:30',
    });
  });

  it('kommt über den Monatswechsel', () => {
    expect(
      movedTo(span({ startDate: '2026-03-31', endDate: '2026-03-31' }), {
        days: 1,
        minutes: 0,
      }),
    ).toEqual({
      startDate: '2026-04-01',
      startTime: '09:00',
      endDate: '2026-04-01',
      endTime: '10:00',
    });
  });

  it('setzt an den Tagesanfang, statt auf den Vortag zu springen', () => {
    expect(movedTo(span(), { days: 0, minutes: -900 })).toEqual({
      startDate: '2026-03-16',
      startTime: '00:00',
      endDate: '2026-03-16',
      endTime: '01:00',
    });
  });

  it('setzt auch beim Tageswechsel an den Anfang des Zieltags', () => {
    expect(movedTo(span(), { days: -1, minutes: -900 })).toEqual({
      startDate: '2026-03-15',
      startTime: '00:00',
      endDate: '2026-03-15',
      endTime: '01:00',
    });
  });

  it('behält die Uhrzeit über die Zeitumstellung', () => {
    expect(
      movedTo(span({ startDate: '2026-03-22', endDate: '2026-03-22' }), {
        days: 8,
        minutes: 0,
      }),
    ).toEqual({
      startDate: '2026-03-30',
      startTime: '09:00',
      endDate: '2026-03-30',
      endTime: '10:00',
    });
  });

  it('lässt einen Termin liegen, wenn nichts bewegt wurde', () => {
    expect(movedTo(span(), { days: 0, minutes: 0 })).toEqual(span());
  });
});

describe('in der Länge ziehen', () => {
  it('verlängert das Ende', () => {
    expect(resizedTo(span(), 60)).toEqual(span({ endTime: '11:00' }));
  });

  it('verkürzt das Ende', () => {
    expect(resizedTo(span(), -30)).toEqual(span({ endTime: '09:30' }));
  });

  it('lässt den Anfang, wo er ist', () => {
    expect(resizedTo(span(), 120).startTime).toBe('09:00');
    expect(resizedTo(span(), -120).startTime).toBe('09:00');
  });

  it('rastet ein', () => {
    expect(resizedTo(span(), 7)).toEqual(span());
    expect(resizedTo(span(), 8)).toEqual(span({ endTime: '10:15' }));
  });

  it('lässt einen Termin nicht vor seinem Anfang enden', () => {
    expect(resizedTo(span(), -300)).toEqual(span({ endTime: '09:15' }));
    expect(resizedTo(span(), -60)).toEqual(span({ endTime: '09:15' }));
  });

  it('hält die kürzeste Länge ein, auch bei einem kurzen Termin', () => {
    const kurz = span({ startTime: '09:00', endTime: '09:15' });

    expect(resizedTo(kurz, -60)).toEqual(kurz);
    expect(MIN_MINUTES).toBe(15);
  });

  it('zieht über Mitternacht hinaus', () => {
    const abend = span({ startTime: '23:00', endTime: '23:30' });

    expect(resizedTo(abend, 120)).toEqual({
      startDate: '2026-03-16',
      startTime: '23:00',
      endDate: '2026-03-17',
      endTime: '01:30',
    });
  });
});

describe('aus Pixeln Zeit', () => {
  it('rechnet Höhe in Minuten', () => {
    expect(minutesFromPixels(46, 46)).toBe(60);
    expect(minutesFromPixels(23, 46)).toBe(30);
    expect(minutesFromPixels(-46, 46)).toBe(-60);
  });

  it('rechnet Breite in Tage', () => {
    expect(daysFromPixels(0, 100)).toBe(0);
    expect(daysFromPixels(140, 100)).toBe(1);
    expect(daysFromPixels(40, 100)).toBe(0);
    expect(daysFromPixels(-140, 100)).toBe(-1);
  });

  it('bleibt bei einer Breite von null stehen', () => {
    expect(daysFromPixels(140, 0)).toBe(0);
  });
});

describe('was am Zeiger steht', () => {
  it('nennt Tag und Uhrzeit', () => {
    expect(moveLabel(span(), false)).toBe('16.3.2026, 09:00–10:00');
  });

  it('lässt bei einem ganztägigen Termin die Uhrzeit weg', () => {
    expect(moveLabel(span(), true)).toBe('16.3.2026');
  });
});
