import { buildIcs, escapeText, foldLine, icsDate, icsTimestamp } from './ics';
import { liesIcs } from './ics-lesen';

const CRLF = '\r\n';

const linesOf = (document: string): string[] =>
  document.split(`${CRLF} `).join('').split(CRLF);

const rawLinesOf = (document: string): string[] => document.split(CRLF);

describe('Sonderzeichen maskieren', () => {
  it('lässt gewöhnlichen Text in Ruhe', () => {
    expect(escapeText('Besprechung mit Herrn Groß')).toBe(
      'Besprechung mit Herrn Groß',
    );
  });

  it('maskiert Komma, Semikolon und Backslash', () => {
    expect(escapeText('Müller, Meier & Co.')).toBe('Müller\\, Meier & Co.');
    expect(escapeText('a;b')).toBe('a\\;b');
    expect(escapeText('C:\\Ordner')).toBe('C:\\\\Ordner');
  });

  it('maskiert den Backslash zuerst', () => {
    expect(escapeText('\\,')).toBe('\\\\\\,');
  });

  it('macht aus einem Zeilenumbruch ein kleines n', () => {
    expect(escapeText('erste\nzweite')).toBe('erste\\nzweite');
    expect(escapeText('erste\r\nzweite')).toBe('erste\\nzweite');
    expect(escapeText('erste\rzweite')).toBe('erste\\nzweite');
  });
});

describe('Zeilen umbrechen', () => {
  it('lässt eine kurze Zeile stehen', () => {
    expect(foldLine('SUMMARY:Kurz')).toBe('SUMMARY:Kurz');
  });

  it('bricht eine lange Zeile mit Leerzeichen um', () => {
    const gefaltet = foldLine(`SUMMARY:${'a'.repeat(200)}`);
    const zeilen = gefaltet.split(CRLF);

    expect(zeilen.length).toBeGreaterThan(1);

    for (const zeile of zeilen) {
      expect(Buffer.byteLength(zeile, 'utf8')).toBeLessThanOrEqual(75);
    }

    for (const zeile of zeilen.slice(1)) {
      expect(zeile.startsWith(' ')).toBe(true);
    }
  });

  it('bricht nach Bytes und nicht nach Zeichen', () => {
    const gefaltet = foldLine(`SUMMARY:${'ü'.repeat(74)}`);

    for (const zeile of gefaltet.split(CRLF)) {
      expect(Buffer.byteLength(zeile, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('zerschneidet kein Zeichen in der Mitte', () => {
    const text = `SUMMARY:${'ä'.repeat(120)}`;
    const zusammen = foldLine(text).split(`${CRLF} `).join('');

    expect(zusammen).toBe(text);
    expect(zusammen).not.toContain('\uFFFD');
  });

  it('setzt wieder zusammen, was hineinging', () => {
    for (const text of [
      'DESCRIPTION:kurz',
      `DESCRIPTION:${'x'.repeat(75)}`,
      `DESCRIPTION:${'x'.repeat(76)}`,
      `DESCRIPTION:${'Ärger über Größe '.repeat(20)}`,
    ]) {
      expect(foldLine(text).split(`${CRLF} `).join('')).toBe(text);
    }
  });
});

describe('Zeitpunkte', () => {
  it('schreibt sie als UTC mit Z', () => {
    expect(icsTimestamp(new Date('2026-03-15T08:00:00Z'))).toBe(
      '20260315T080000Z',
    );
  });

  it('lässt die Millisekunden weg', () => {
    expect(icsTimestamp(new Date('2026-03-15T08:00:00.123Z'))).toBe(
      '20260315T080000Z',
    );
  });

  it('schreibt einen ganzen Tag als Datum in Berliner Zeit', () => {
    expect(icsDate(new Date('2026-03-15T23:00:00Z'))).toBe('20260316');
    expect(icsDate(new Date('2026-07-15T22:00:00Z'))).toBe('20260716');
  });
});

describe('die ganze Datei', () => {
  const termin = {
    uid: 'abc-123@stegwerk',
    startsAt: new Date('2026-03-15T08:00:00Z'),
    endsAt: new Date('2026-03-15T09:00:00Z'),
    summary: 'Ortstermin',
  };

  const stamp = new Date('2026-03-01T10:00:00Z');

  it('hat den Rahmen, den ein Kalender erwartet', () => {
    const zeilen = linesOf(buildIcs([termin], { stamp }));

    expect(zeilen[0]).toBe('BEGIN:VCALENDAR');
    expect(zeilen).toContain('VERSION:2.0');
    expect(zeilen).toContain('METHOD:PUBLISH');
    expect(zeilen.some((zeile) => zeile.startsWith('PRODID:'))).toBe(true);
    expect(zeilen).toContain('END:VCALENDAR');
  });

  it('endet mit CRLF, auch in der letzten Zeile', () => {
    expect(buildIcs([termin], { stamp }).endsWith(CRLF)).toBe(true);
  });

  it('benutzt CRLF und keinen bloßen Zeilenumbruch', () => {
    const datei = buildIcs([termin], { stamp });

    expect(datei.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('trägt Beginn, Ende und Titel ein', () => {
    const zeilen = linesOf(buildIcs([termin], { stamp }));

    expect(zeilen).toContain('UID:abc-123@stegwerk');
    expect(zeilen).toContain('DTSTART:20260315T080000Z');
    expect(zeilen).toContain('DTEND:20260315T090000Z');
    expect(zeilen).toContain('SUMMARY:Ortstermin');
    expect(zeilen).toContain('DTSTAMP:20260301T100000Z');
  });

  it('schreibt einen ganztägigen Termin als Datum ohne Uhrzeit', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            allDay: true,
            startsAt: new Date('2026-03-15T23:00:00Z'),
            endsAt: new Date('2026-03-16T23:00:00Z'),
          },
        ],
        { stamp },
      ),
    );

    expect(zeilen).toContain('DTSTART;VALUE=DATE:20260316');
    expect(zeilen).toContain('DTEND;VALUE=DATE:20260317');
    expect(zeilen.some((zeile) => zeile.startsWith('DTSTART:'))).toBe(false);
  });

  it('bleibt bei einem gewöhnlichen Termin bei der Uhrzeit', () => {
    const zeilen = linesOf(buildIcs([termin], { stamp }));

    expect(zeilen).toContain('DTSTART:20260315T080000Z');
    expect(zeilen.some((zeile) => zeile.startsWith('DTSTART;VALUE=DATE'))).toBe(
      false,
    );
  });

  it('lässt leere Felder ganz weg', () => {
    const datei = buildIcs([{ ...termin, location: '', description: null }], {
      stamp,
    });

    expect(datei).not.toContain('LOCATION');
    expect(datei).not.toContain('DESCRIPTION');
  });

  it('schreibt Ort und Notiz, wenn es sie gibt', () => {
    const zeilen = linesOf(
      buildIcs(
        [{ ...termin, location: 'Beim Kunden', description: 'Bitte Leiter' }],
        { stamp },
      ),
    );

    expect(zeilen).toContain('LOCATION:Beim Kunden');
    expect(zeilen).toContain('DESCRIPTION:Bitte Leiter');
  });

  it('maskiert, was in den Text hineingerät', () => {
    const datei = buildIcs([{ ...termin, summary: 'Müller, Meier; Groß' }], {
      stamp,
    });

    expect(datei).toContain('SUMMARY:Müller\\, Meier\\; Groß');
  });

  it('sagt bei jedem Termin, ob er noch gilt', () => {
    const laufend = linesOf(buildIcs([termin], { stamp }));
    const abgesagt = linesOf(
      buildIcs([{ ...termin, cancelled: true }], { stamp }),
    );

    expect(laufend).toContain('STATUS:CONFIRMED');
    expect(abgesagt).toContain('STATUS:CANCELLED');
  });

  it('nennt den Veranstalter mit Namen in Anführungszeichen', () => {
    const datei = buildIcs(
      [
        {
          ...termin,
          organizerEmail: 'buero@example.de',
          organizerName: 'Meier, Anna',
        },
      ],
      { stamp },
    );

    expect(datei).toContain(
      'ORGANIZER;CN="Meier, Anna":mailto:buero@example.de',
    );
  });

  it('lässt keinen Zeilenumbruch aus Name oder Adresse durch', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            attendees: [
              {
                email: 'x@example.de\r\nATTACH:https://boese.test',
                name: 'Max\r\nATTACH:https://boese.test',
              },
            ],
          },
        ],
        { stamp },
      ),
    );

    expect(zeilen.some((zeile) => zeile.startsWith('ATTACH'))).toBe(false);
  });

  it('nimmt jeden Eingeladenen als eigene Zeile', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            attendees: [{ email: 'a@example.de' }, { email: 'b@example.de' }],
          },
        ],
        { stamp },
      ),
    );

    const eingeladene = zeilen.filter((zeile) => zeile.startsWith('ATTENDEE'));

    expect(eingeladene).toHaveLength(2);
    expect(eingeladene[0]).toContain('mailto:a@example.de');
  });

  it('schreibt Name und Stand des Teilnehmers mit', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            attendees: [
              {
                email: 'k.boehm@example.de',
                name: 'Katrin Böhm',
                partstat: 'ACCEPTED',
              },
            ],
          },
        ],
        { stamp },
      ),
    );

    expect(zeilen.find((zeile) => zeile.startsWith('ATTENDEE'))).toBe(
      'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Katrin Böhm":mailto:k.boehm@example.de',
    );
  });

  it('lässt einen Teilnehmer ohne Adresse weg', () => {
    const datei = buildIcs(
      [
        {
          ...termin,
          attendees: [
            { email: null, name: 'Ohne Adresse' },
            { email: '', name: 'Auch ohne' },
            { email: 'da@example.de' },
          ],
        },
      ],
      { stamp },
    );

    expect(
      linesOf(datei).filter((zeile) => zeile.startsWith('ATTENDEE')),
    ).toHaveLength(1);
  });

  it('schreibt eine Serie als Regel und nicht als hundert Termine', () => {
    const zeilen = linesOf(
      buildIcs([{ ...termin, recurrence: 'FREQ=WEEKLY;INTERVAL=2' }], {
        stamp,
      }),
    );

    expect(zeilen).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(zeilen.filter((zeile) => zeile === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('schreibt ausgefallene Tage mit der Uhrzeit des Serienbeginns', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            recurrence: 'FREQ=WEEKLY',
            skippedDates: ['2026-03-22', '2026-03-29'],
          },
        ],
        { stamp },
      ),
    );

    expect(zeilen).toContain('EXDATE;TZID=Europe/Berlin:20260322T090000');
    expect(zeilen).toContain('EXDATE;TZID=Europe/Berlin:20260329T090000');
  });

  it('schreibt eine Serie in Berliner Zeit, damit sie die Zeitumstellung übersteht', () => {
    const text = buildIcs(
      [{ ...termin, recurrence: 'FREQ=WEEKLY;UNTIL=20261231' }],
      { stamp },
    );
    const zeilen = linesOf(text);

    expect(zeilen).toContain('DTSTART;TZID=Europe/Berlin:20260315T090000');
    expect(zeilen).toContain('DTEND;TZID=Europe/Berlin:20260315T100000');
    expect(zeilen).toContain('BEGIN:VTIMEZONE');
    expect(zeilen).toContain('TZID:Europe/Berlin');
    expect(zeilen).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261231T225959Z');

    const [gelesen] = liesIcs(text).termine;

    expect(gelesen.startsAt.toISOString()).toBe('2026-03-15T08:00:00.000Z');
    expect(gelesen.regel).toContain('FREQ=WEEKLY');
  });

  it('lässt einzelne Termine in UTC und ohne Zonenblock', () => {
    const zeilen = linesOf(buildIcs([termin], { stamp }));

    expect(zeilen).toContain('DTSTART:20260315T080000Z');
    expect(zeilen).not.toContain('BEGIN:VTIMEZONE');
  });

  it('schreibt ausgefallene Tage eines ganztägigen Termins als Datum', () => {
    const zeilen = linesOf(
      buildIcs(
        [
          {
            ...termin,
            allDay: true,
            startsAt: new Date('2026-03-15T23:00:00Z'),
            endsAt: new Date('2026-03-16T23:00:00Z'),
            recurrence: 'FREQ=WEEKLY',
            skippedDates: ['2026-03-23'],
          },
        ],
        { stamp },
      ),
    );

    expect(zeilen).toContain('EXDATE;VALUE=DATE:20260323');
  });

  it('schreibt keine Regel, wenn es keine gibt', () => {
    const datei = buildIcs([{ ...termin, skippedDates: ['2026-03-23'] }], {
      stamp,
    });

    expect(datei).not.toContain('RRULE');
    expect(datei).not.toContain('EXDATE');
  });

  it('nimmt den eigenen Änderungszeitpunkt, wenn es einen gibt', () => {
    const zeilen = linesOf(
      buildIcs([{ ...termin, changedAt: new Date('2026-03-02T07:00:00Z') }], {
        stamp,
      }),
    );

    expect(zeilen).toContain('DTSTAMP:20260302T070000Z');
  });

  it('packt mehrere Termine in eine Datei', () => {
    const zeilen = linesOf(
      buildIcs(
        [termin, { ...termin, uid: 'zweiter@stegwerk', summary: 'Zweiter' }],
        { stamp },
      ),
    );

    expect(zeilen.filter((zeile) => zeile === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(zeilen.filter((zeile) => zeile === 'END:VEVENT')).toHaveLength(2);
    expect(zeilen.filter((zeile) => zeile === 'BEGIN:VCALENDAR')).toHaveLength(
      1,
    );
  });

  it('kommt auch mit gar keinem Termin zurecht', () => {
    const zeilen = linesOf(buildIcs([], { stamp }));

    expect(zeilen).toContain('BEGIN:VCALENDAR');
    expect(zeilen).toContain('END:VCALENDAR');
    expect(zeilen).not.toContain('BEGIN:VEVENT');
  });

  it('hält auch bei langem Titel jede Zeile unter der Grenze', () => {
    const datei = buildIcs(
      [{ ...termin, summary: `Jahresgespräch mit ${'Müller '.repeat(20)}` }],
      { stamp },
    );

    for (const zeile of rawLinesOf(datei)) {
      expect(Buffer.byteLength(zeile, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
