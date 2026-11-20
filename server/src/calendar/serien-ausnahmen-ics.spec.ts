import { type AppointmentEntity } from './appointment.entity';
import { instantFromBerlin } from './berlin-time';
import { buildIcs } from './ics';
import { serieAlsEvents } from './ics-export.service';
import { liesIcs } from './ics-lesen';

const CRLF = '\r\n';
const zeilen = (text: string): string[] =>
  text.split(`${CRLF} `).join('').split(CRLF);

const termin = (
  teile: Partial<AppointmentEntity> & Pick<AppointmentEntity, 'id'>,
): AppointmentEntity =>
  ({
    title: 'Jour fixe',
    description: null,
    location: null,
    videoLink: null,
    allDay: false,
    recurrence: null,
    skippedDates: [],
    cancelledAt: null,
    serieId: null,
    serieDatum: null,
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    startsAt: instantFromBerlin('2026-03-16', '09:00'),
    endsAt: instantFromBerlin('2026-03-16', '10:00'),
    ...teile,
  }) as AppointmentEntity;

const SERIE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUSNAHME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Ausnahmen in der Datei', () => {
  it('schreibt die Ausnahme mit der UID der Serie und RECURRENCE-ID in Berliner Zeit', () => {
    const serie = termin({
      id: SERIE,
      recurrence: 'FREQ=WEEKLY',
      skippedDates: ['2026-04-06', '2026-04-13'],
    });
    const ausnahme = termin({
      id: AUSNAHME,
      serieId: SERIE,
      serieDatum: '2026-04-13',
      startsAt: instantFromBerlin('2026-04-14', '15:00'),
      endsAt: instantFromBerlin('2026-04-14', '16:00'),
      title: 'Jour fixe (verschoben)',
    });

    const text = buildIcs(
      serieAlsEvents(
        serie,
        'stegwerk.test',
        [],
        [{ termin: ausnahme, runde: [] }],
      ),
      { ohneMethode: true },
    );
    const alle = zeilen(text);

    expect(
      alle.filter((zeile) => zeile === `UID:${SERIE}@stegwerk.test`),
    ).toHaveLength(2);
    expect(alle).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20260413T090000');
    expect(alle).toContain('EXDATE;TZID=Europe/Berlin:20260406T090000');
    expect(alle).not.toContain('EXDATE;TZID=Europe/Berlin:20260413T090000');
    expect(alle).toContain('BEGIN:VTIMEZONE');
    expect(
      alle.filter((zeile) => zeile.startsWith('RRULE:FREQ=WEEKLY')),
    ).toHaveLength(1);
  });

  it('schreibt bei einer ganztägigen Serie die RECURRENCE-ID als Datum', () => {
    const serie = termin({
      id: SERIE,
      recurrence: 'FREQ=WEEKLY',
      allDay: true,
      skippedDates: ['2026-03-23'],
      startsAt: instantFromBerlin('2026-03-16', '00:00'),
      endsAt: instantFromBerlin('2026-03-17', '00:00'),
    });
    const ausnahme = termin({
      id: AUSNAHME,
      serieId: SERIE,
      serieDatum: '2026-03-23',
      allDay: true,
      cancelledAt: new Date(),
      startsAt: instantFromBerlin('2026-03-23', '00:00'),
      endsAt: instantFromBerlin('2026-03-24', '00:00'),
    });

    const alle = zeilen(
      buildIcs(
        serieAlsEvents(serie, 'h', [], [{ termin: ausnahme, runde: [] }]),
      ),
    );

    expect(alle).toContain('RECURRENCE-ID;VALUE=DATE:20260323');
    expect(alle).toContain('STATUS:CANCELLED');
    expect(alle.some((zeile) => zeile.startsWith('EXDATE'))).toBe(false);
  });

  it('liest eine eigene Datei zurück, wie sie hinausging', () => {
    const serie = termin({
      id: SERIE,
      recurrence: 'FREQ=WEEKLY',
      skippedDates: ['2026-04-06', '2026-04-13'],
    });
    const ausnahme = termin({
      id: AUSNAHME,
      serieId: SERIE,
      serieDatum: '2026-04-13',
      startsAt: instantFromBerlin('2026-04-14', '15:00'),
      endsAt: instantFromBerlin('2026-04-14', '16:00'),
    });

    const datei = liesIcs(
      buildIcs(
        serieAlsEvents(serie, 'h', [], [{ termin: ausnahme, runde: [] }]),
      ),
    );

    expect(datei.termine).toHaveLength(1);
    expect(datei.termine[0].ausfaelle).toEqual(['2026-04-06']);
    expect(datei.ausnahmen).toHaveLength(1);
    expect(datei.ausnahmen[0].serienTag).toBe('2026-04-13');
    expect(datei.ausnahmen[0].startsAt.toISOString()).toBe(
      '2026-04-14T13:00:00.000Z',
    );
    expect(datei.ausnahmen[0].regel).toBeNull();
  });
});

describe('Ausnahmen aus fremden Kalendern lesen', () => {
  it('liest Google: EXDATE in UTC und eine Ausnahme mit TZID', () => {
    const google = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Berlin:20261019T100000',
      'DTEND;TZID=Europe/Berlin:20261019T103000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'EXDATE;TZID=Europe/Berlin:20261026T100000',
      'EXDATE:20261102T090000Z',
      'UID:abc123@google.com',
      'SUMMARY:Standup',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Berlin:20261110T140000',
      'DTEND;TZID=Europe/Berlin:20261110T143000',
      'UID:abc123@google.com',
      'RECURRENCE-ID;TZID=Europe/Berlin:20261109T100000',
      'SUMMARY:Standup (Dienstag)',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join(CRLF);

    const datei = liesIcs(google);

    expect(datei.termine).toHaveLength(1);
    expect(datei.termine[0].regel).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(datei.termine[0].ausfaelle).toEqual(['2026-10-26', '2026-11-02']);
    expect(datei.ausnahmen).toHaveLength(1);
    expect(datei.ausnahmen[0].serienTag).toBe('2026-11-09');
    expect(datei.ausnahmen[0].titel).toBe('Standup (Dienstag)');
  });

  it('liest Nextcloud: ganztägig, EXDATE als Datumsliste, abgesagte Ausnahme', () => {
    const nextcloud = [
      'BEGIN:VCALENDAR',
      'PRODID:-//IDN nextcloud.com//Calendar app 4.7.0//EN',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:9f1c-nc',
      'DTSTART;VALUE=DATE:20260302',
      'DTEND;VALUE=DATE:20260303',
      'RRULE:FREQ=WEEKLY;COUNT=10',
      'EXDATE;VALUE=DATE:20260309,20260316',
      'SUMMARY:Homeoffice',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:9f1c-nc',
      'RECURRENCE-ID;VALUE=DATE:20260323',
      'DTSTART;VALUE=DATE:20260323',
      'DTEND;VALUE=DATE:20260324',
      'STATUS:CANCELLED',
      'SUMMARY:Homeoffice',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const datei = liesIcs(nextcloud);

    expect(datei.termine[0].ausfaelle).toEqual(['2026-03-09', '2026-03-16']);
    expect(datei.ausnahmen[0].serienTag).toBe('2026-03-23');
    expect(datei.ausnahmen[0].abgesagt).toBe(true);
    expect(datei.ausnahmen[0].ganztaegig).toBe(true);
  });

  it('liest eine Ausnahme vor ihrer Serie (Apple schreibt manchmal so)', () => {
    const apple = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:apple-1',
      'RECURRENCE-ID:20260323T080000Z',
      'DTSTART:20260323T120000Z',
      'DTEND:20260323T130000Z',
      'SUMMARY:Verschoben',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:apple-1',
      'DTSTART:20260316T080000Z',
      'DTEND:20260316T090000Z',
      'RRULE:FREQ=WEEKLY',
      'SUMMARY:Serie',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join(CRLF);

    const datei = liesIcs(apple);

    expect(datei.termine.map((eintrag) => eintrag.titel)).toEqual(['Serie']);
    expect(datei.ausnahmen.map((eintrag) => eintrag.serienTag)).toEqual([
      '2026-03-23',
    ]);
  });

  it('nimmt eine Ausnahme ohne ihre Serie als gewöhnlichen Termin', () => {
    const nurEinTag = [
      'BEGIN:VCALENDAR',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:nur-ein-tag@google.com',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260323T090000',
      'DTSTART;TZID=Europe/Berlin:20260323T110000',
      'DTEND;TZID=Europe/Berlin:20260323T120000',
      'SUMMARY:Einzeln eingeladen',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join(CRLF);

    const datei = liesIcs(nurEinTag);

    expect(datei.ausnahmen).toHaveLength(0);
    expect(datei.termine).toHaveLength(1);
    expect(datei.termine[0].regel).toBeNull();
    expect(datei.termine[0].serienTag).toBe('2026-03-23');
  });
});
