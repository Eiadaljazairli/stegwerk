import {
  DAYS_BETWEEN_STEPS,
  daysBetween,
  DunningLevel,
  dunningStateOf,
  type DunningSubject,
  interestCents,
  lateFeeCents,
  mayRemindToday,
} from './dunning';

const offen = (overrides: Partial<DunningSubject> = {}): DunningSubject => ({
  dueOn: '2026-03-01',
  settled: false,
  sent: [],
  ...overrides,
});

describe('Tage zählen', () => {
  it('zählt vorwärts', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
  });

  it('zählt über den Monatswechsel', () => {
    expect(daysBetween('2026-01-28', '2026-02-03')).toBe(6);
  });

  it('zählt über den Jahreswechsel', () => {
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
  });

  it('kennt den Schalttag', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('zählt rückwärts als negativ', () => {
    expect(daysBetween('2026-03-15', '2026-03-01')).toBe(-14);
  });

  it('stört sich nicht an einer angehängten Uhrzeit', () => {
    expect(daysBetween('2026-03-01T22:00:00Z', '2026-03-02T03:00:00Z')).toBe(1);
  });

  it('antwortet mit null auf Unsinn, statt zu werfen', () => {
    expect(daysBetween('kein Datum', '2026-03-01')).toBe(0);
  });
});

describe('wo eine Forderung steht', () => {
  it('lässt eine Rechnung vor der Frist in Ruhe', () => {
    const state = dunningStateOf(offen(), '2026-02-20');

    expect(state.level).toBe(DunningLevel.NONE);
    expect(state.nextStep).toBeNull();
  });

  it('lässt sie auch am Fälligkeitstag selbst in Ruhe', () => {
    expect(dunningStateOf(offen(), '2026-03-01').level).toBe(DunningLevel.NONE);
  });

  it('meldet sie am Tag danach als fällig', () => {
    const state = dunningStateOf(offen(), '2026-03-02');

    expect(state.level).toBe(DunningLevel.DUE);
    expect(state.daysOverdue).toBe(1);
    expect(state.nextStep).toBe(DunningLevel.REMINDER);
  });

  it('lässt eine bezahlte Rechnung in Ruhe', () => {
    expect(dunningStateOf(offen({ settled: true }), '2026-06-01').level).toBe(
      DunningLevel.NONE,
    );
  });

  it('lässt eine Rechnung ohne Frist in Ruhe', () => {
    expect(
      dunningStateOf(offen({ dueOn: null }), '2026-06-01').nextStep,
    ).toBeNull();
  });
});

describe('die Reihenfolge der Stufen', () => {
  it('geht von der Erinnerung zur ersten Mahnung', () => {
    const state = dunningStateOf(
      offen({
        sent: [{ level: DunningLevel.REMINDER, sentOn: '2026-03-05' }],
      }),
      '2026-03-20',
    );

    expect(state.level).toBe(DunningLevel.REMINDER);
    expect(state.nextStep).toBe(DunningLevel.FIRST);
  });

  it('geht von der ersten zur letzten Mahnung', () => {
    const state = dunningStateOf(
      offen({
        sent: [
          { level: DunningLevel.REMINDER, sentOn: '2026-03-05' },
          { level: DunningLevel.FIRST, sentOn: '2026-03-15' },
        ],
      }),
      '2026-04-01',
    );

    expect(state.nextStep).toBe(DunningLevel.FINAL);
  });

  it('hört nach der letzten Mahnung auf', () => {
    const state = dunningStateOf(
      offen({
        sent: [
          { level: DunningLevel.REMINDER, sentOn: '2026-03-05' },
          { level: DunningLevel.FIRST, sentOn: '2026-03-15' },
          { level: DunningLevel.FINAL, sentOn: '2026-03-25' },
        ],
      }),
      '2026-05-01',
    );

    expect(state.level).toBe(DunningLevel.FINAL);
    expect(state.nextStep).toBeNull();
  });

  it('überspringt keine Stufe, nur weil die Rechnung alt ist', () => {
    const state = dunningStateOf(offen(), '2026-06-01');

    expect(state.level).toBe(DunningLevel.DUE);
    expect(state.nextStep).toBe(DunningLevel.REMINDER);
  });

  it('richtet sich nach der höchsten Stufe, nicht nach der letzten Zeile', () => {
    const state = dunningStateOf(
      offen({
        sent: [
          { level: DunningLevel.FIRST, sentOn: '2026-03-15' },
          { level: DunningLevel.REMINDER, sentOn: '2026-03-05' },
        ],
      }),
      '2026-04-01',
    );

    expect(state.level).toBe(DunningLevel.FIRST);
  });
});

describe('wann die nächste Stufe darf', () => {
  it('lässt die erste Erinnerung sofort zu', () => {
    expect(mayRemindToday(dunningStateOf(offen(), '2026-03-02'))).toBe(true);
  });

  it('lässt eine Woche zwischen zwei Stufen', () => {
    const gerade = dunningStateOf(
      offen({ sent: [{ level: DunningLevel.REMINDER, sentOn: '2026-03-05' }] }),
      '2026-03-06',
    );

    expect(mayRemindToday(gerade)).toBe(false);
    expect(gerade.nextStepOn).toBe('2026-03-12');
  });

  it('lässt sie am siebten Tag zu', () => {
    const spaeter = dunningStateOf(
      offen({ sent: [{ level: DunningLevel.REMINDER, sentOn: '2026-03-05' }] }),
      `2026-03-${String(5 + DAYS_BETWEEN_STEPS).padStart(2, '0')}`,
    );

    expect(mayRemindToday(spaeter)).toBe(true);
  });
});

describe('Verzug nach §286 Abs. 3 BGB', () => {
  it('tritt nach dreißig Tagen ein', () => {
    expect(dunningStateOf(offen(), '2026-03-31').inDefault).toBe(true);
  });

  it('ist am neunundzwanzigsten Tag noch nicht da', () => {
    expect(dunningStateOf(offen(), '2026-03-30').inDefault).toBe(false);
  });
});

describe('Verzugszinsen nach §288 BGB', () => {
  it('rechnet tagegenau auf den Bruttobetrag', () => {
    expect(interestCents(100_000, 30, 3, false)).toBe(986);
  });

  it('nimmt gegenüber Verbrauchern fünf Punkte statt neun', () => {
    expect(interestCents(100_000, 30, 3, true)).toBeLessThan(
      interestCents(100_000, 30, 3, false),
    );
    expect(interestCents(100_000, 30, 3, true)).toBe(658);
  });

  it('rechnet gar nichts, solange kein Basiszinssatz hinterlegt ist', () => {
    expect(interestCents(100_000, 30, null, false)).toBe(0);
  });

  it('rechnet nichts für null Tage', () => {
    expect(interestCents(100_000, 0, 3, false)).toBe(0);
  });

  it('rechnet nichts auf einen Betrag von null', () => {
    expect(interestCents(0, 30, 3, false)).toBe(0);
  });

  it('rechnet nichts bei einem negativen Basiszinssatz, der alles aufhebt', () => {
    expect(interestCents(100_000, 30, -10, false)).toBe(0);
  });

  it('wächst mit der Zeit', () => {
    expect(interestCents(100_000, 60, 3, false)).toBeGreaterThan(
      interestCents(100_000, 30, 3, false),
    );
  });
});

describe('die Pauschale nach §288 Abs. 5 BGB', () => {
  it('sind vierzig Euro gegenüber einem Unternehmen im Verzug', () => {
    expect(lateFeeCents(false, true)).toBe(4000);
  });

  it('gibt es gegenüber einem Verbraucher nicht', () => {
    expect(lateFeeCents(true, true)).toBe(0);
  });

  it('gibt es vor dem Verzug nicht', () => {
    expect(lateFeeCents(false, false)).toBe(0);
  });
});
