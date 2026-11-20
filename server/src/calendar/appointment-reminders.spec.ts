import {
  type RemindableAppointment,
  reminderSubject,
  reminderText,
  reminderVerdict,
} from './appointment-reminders';

const termin = (
  overrides: Partial<RemindableAppointment> = {},
): RemindableAppointment => ({
  id: 'a1',
  title: 'Ortstermin',
  location: null,
  startsAt: new Date('2026-03-16T08:00:00Z'),
  endsAt: new Date('2026-03-16T09:00:00Z'),
  allDay: false,
  remindMinutesBefore: 30,
  remindedAt: null,
  cancelledAt: null,
  ...overrides,
});

describe('ob erinnert wird', () => {
  it('schweigt, solange es zu früh ist', () => {
    expect(reminderVerdict(termin(), new Date('2026-03-16T07:29:00Z'))).toBe(
      'zu früh',
    );
  });

  it('erinnert genau ab der eingestellten Vorlaufzeit', () => {
    expect(reminderVerdict(termin(), new Date('2026-03-16T07:30:00Z'))).toBe(
      'senden',
    );
  });

  it('erinnert auch noch kurz vor dem Beginn', () => {
    expect(reminderVerdict(termin(), new Date('2026-03-16T07:59:00Z'))).toBe(
      'senden',
    );
  });

  it('lässt die Erinnerung ab dem Beginn verfallen', () => {
    expect(reminderVerdict(termin(), new Date('2026-03-16T08:00:00Z'))).toBe(
      'verfallen',
    );
    expect(reminderVerdict(termin(), new Date('2026-03-16T09:30:00Z'))).toBe(
      'verfallen',
    );
  });

  it('schweigt, wenn keine Erinnerung eingestellt ist', () => {
    expect(
      reminderVerdict(
        termin({ remindMinutesBefore: null }),
        new Date('2026-03-16T07:45:00Z'),
      ),
    ).toBe('nichts');
  });

  it('schweigt, wenn sie schon hinaus ist', () => {
    expect(
      reminderVerdict(
        termin({ remindedAt: new Date('2026-03-16T07:31:00Z') }),
        new Date('2026-03-16T07:45:00Z'),
      ),
    ).toBe('nichts');
  });

  it('schweigt bei einem abgesagten Termin', () => {
    expect(
      reminderVerdict(
        termin({ cancelledAt: new Date('2026-03-15T10:00:00Z') }),
        new Date('2026-03-16T07:45:00Z'),
      ),
    ).toBe('nichts');
  });

  it('kommt mit einer Vorlaufzeit von null zurecht', () => {
    const sofort = termin({ remindMinutesBefore: 0 });

    expect(reminderVerdict(sofort, new Date('2026-03-16T07:59:00Z'))).toBe(
      'zu früh',
    );
    expect(reminderVerdict(sofort, new Date('2026-03-16T08:00:00Z'))).toBe(
      'verfallen',
    );
  });

  it('rechnet die Vorlaufzeit in Minuten und nicht in etwas anderem', () => {
    const tagsZuvor = termin({ remindMinutesBefore: 1440 });

    expect(reminderVerdict(tagsZuvor, new Date('2026-03-15T07:59:00Z'))).toBe(
      'zu früh',
    );
    expect(reminderVerdict(tagsZuvor, new Date('2026-03-15T08:00:00Z'))).toBe(
      'senden',
    );
  });
});

describe('was in der Mail steht', () => {
  it('nennt Titel, Tag und Uhrzeit im Betreff', () => {
    expect(reminderSubject(termin())).toBe(
      'Erinnerung: Ortstermin am 2026-03-16 um 09:00 Uhr',
    );
  });

  it('lässt bei einem ganztägigen Termin die Uhrzeit weg', () => {
    expect(reminderSubject(termin({ allDay: true }))).toBe(
      'Erinnerung: Ortstermin am 2026-03-16, ganztägig',
    );
  });

  it('rechnet auch im Sommer richtig', () => {
    const sommer = termin({
      startsAt: new Date('2026-07-16T07:00:00Z'),
      endsAt: new Date('2026-07-16T08:00:00Z'),
    });

    expect(reminderSubject(sommer)).toContain('um 09:00 Uhr');
  });

  it('nennt den Ort, wenn einer hinterlegt ist', () => {
    const text = reminderText(
      termin({ location: 'Beim Kunden' }),
      'Frau Meier',
    );

    expect(text).toContain('Ort: Beim Kunden');
  });

  it('schreibt keine leere Ortszeile', () => {
    expect(reminderText(termin({ location: '' }), 'Frau Meier')).not.toContain(
      'Ort:',
    );
    expect(reminderText(termin(), 'Frau Meier')).not.toContain('Ort:');
  });

  it('nennt das Ende nur bei einem Termin mit Uhrzeit', () => {
    expect(reminderText(termin(), 'Frau Meier')).toContain('Ende: 10:00 Uhr');
    expect(reminderText(termin({ allDay: true }), 'Frau Meier')).not.toContain(
      'Ende:',
    );
  });

  it('spricht die Person an und sagt, wie man sie loswird', () => {
    const text = reminderText(termin(), 'Frau Meier');

    expect(text).toContain('Hallo Frau Meier,');
    expect(text).toContain('abschalten');
  });
});
