import {
  berlinDate,
  berlinOffsetMinutes,
  berlinTime,
  daysCovered,
  durationMinutes,
  instantFromBerlin,
  overlaps,
  spansMidnight,
} from './berlin-time';

describe('die Wandzeit ablesen', () => {
  it('liest Winterzeit als UTC plus eins', () => {
    const instant = new Date('2026-01-15T08:00:00Z');

    expect(berlinDate(instant)).toBe('2026-01-15');
    expect(berlinTime(instant)).toBe('09:00');
  });

  it('liest Sommerzeit als UTC plus zwei', () => {
    const instant = new Date('2026-07-15T07:00:00Z');

    expect(berlinTime(instant)).toBe('09:00');
  });

  it('zeigt Mitternacht als 00:00 und nicht als 24:00', () => {
    const instant = new Date('2026-05-31T22:00:00Z');

    expect(berlinTime(instant)).toBe('00:00');
    expect(berlinDate(instant)).toBe('2026-06-01');
  });

  it('legt den Tageswechsel auf die Berliner Uhr', () => {
    expect(berlinDate(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });
});

describe('aus Wandzeit einen Zeitpunkt machen', () => {
  it('rechnet die Winterzeit zurück', () => {
    expect(instantFromBerlin('2026-01-15', '09:00').toISOString()).toBe(
      '2026-01-15T08:00:00.000Z',
    );
  });

  it('rechnet die Sommerzeit zurück', () => {
    expect(instantFromBerlin('2026-07-15', '09:00').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
  });

  it('kommt bei jeder Uhrzeit wieder heraus, wo es hineinging', () => {
    for (const date of [
      '2026-01-15',
      '2026-05-20',
      '2026-11-03',
      '2027-02-28',
    ]) {
      for (const time of ['00:00', '07:30', '12:00', '18:45', '23:59']) {
        const instant = instantFromBerlin(date, time);

        expect(`${berlinDate(instant)} ${berlinTime(instant)}`).toBe(
          `${date} ${time}`,
        );
      }
    }
  });

  it('kommt auch an den Umstellungstagen heraus, wo es hineinging', () => {
    for (const [date, time] of [
      ['2026-03-29', '01:00'],
      ['2026-03-29', '04:00'],
      ['2026-10-25', '00:30'],
      ['2026-10-25', '04:00'],
      ['2027-03-28', '01:00'],
      ['2027-10-31', '04:00'],
    ]) {
      const instant = instantFromBerlin(date, time);

      expect(`${berlinDate(instant)} ${berlinTime(instant)}`).toBe(
        `${date} ${time}`,
      );
    }
  });

  it('springt über die Stunde, die es im März nicht gibt', () => {
    const instant = instantFromBerlin('2026-03-29', '02:30');

    expect(instant.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(berlinTime(instant)).toBe('03:30');
  });

  it('nimmt im Oktober die zweite der beiden gleichen Stunden', () => {
    const instant = instantFromBerlin('2026-10-25', '02:30');

    expect(instant.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });

  it('wehrt sich gegen Unsinn, statt still etwas zu liefern', () => {
    expect(() => instantFromBerlin('kein Datum', '09:00')).toThrow(
      'Kein gültiger Zeitpunkt: kein Datum 09:00',
    );
    expect(() => instantFromBerlin('2026-01-15', 'neun Uhr')).toThrow(
      'Kein gültiger Zeitpunkt: 2026-01-15 neun Uhr',
    );
    expect(() => instantFromBerlin('2026-01-15', '09:dreißig')).toThrow(
      'Kein gültiger Zeitpunkt',
    );
    expect(() => instantFromBerlin('2026-01-15', '250:00')).toThrow(
      'Kein gültiger Zeitpunkt',
    );
  });

  it('nimmt keine Uhrzeit an, die nur zufällig eine Zahl ergibt', () => {
    for (const unsinn of [
      '::',
      '',
      '0x0A:00',
      ' 9:30',
      '09:30 ',
      '9.5:00',
      '9:5',
    ]) {
      expect(() => instantFromBerlin('2026-01-15', unsinn)).toThrow(
        'Kein gültiger Zeitpunkt',
      );
    }
  });

  it('weist Uhrzeiten ab, die es auf keiner Uhr gibt', () => {
    expect(() => instantFromBerlin('2026-01-15', '24:00')).toThrow(
      'Diese Uhrzeit gibt es nicht: 24:00',
    );
    expect(() => instantFromBerlin('2026-01-15', '09:60')).toThrow(
      'Diese Uhrzeit gibt es nicht: 09:60',
    );
    expect(() => instantFromBerlin('2026-01-15', '99:99')).toThrow(
      'Diese Uhrzeit gibt es nicht: 99:99',
    );

    expect(berlinTime(instantFromBerlin('2026-01-15', '23:59'))).toBe('23:59');
    expect(berlinTime(instantFromBerlin('2026-01-15', '00:00'))).toBe('00:00');
  });

  it('nimmt eine einstellige Stunde an', () => {
    expect(berlinTime(instantFromBerlin('2026-01-15', '9:30'))).toBe('09:30');
  });

  it('weist Tage ab, die es nicht gibt', () => {
    expect(() => instantFromBerlin('2026-02-30', '09:00')).toThrow(
      'Kein gültiger Zeitpunkt: 2026-02-30 09:00',
    );
    expect(() => instantFromBerlin('2026-02-29', '09:00')).toThrow(
      'Kein gültiger Zeitpunkt: 2026-02-29 09:00',
    );
    expect(() => instantFromBerlin('2026-04-31', '09:00')).toThrow(
      'Kein gültiger Zeitpunkt: 2026-04-31 09:00',
    );

    expect(berlinDate(instantFromBerlin('2028-02-29', '09:00'))).toBe(
      '2028-02-29',
    );
  });
});

describe('der Abstand zu UTC', () => {
  it('ist im Winter eine Stunde und im Sommer zwei', () => {
    expect(berlinOffsetMinutes(new Date('2026-01-15T08:00:00Z'))).toBe(60);
    expect(berlinOffsetMinutes(new Date('2026-07-15T08:00:00Z'))).toBe(120);
  });

  it('lässt sich von Sekunden nicht beirren', () => {
    expect(berlinOffsetMinutes(new Date('2026-01-15T08:00:30Z'))).toBe(60);
    expect(berlinOffsetMinutes(new Date('2026-07-15T08:00:59.999Z'))).toBe(120);
  });

  it('wechselt genau am Umstellungspunkt', () => {
    expect(berlinOffsetMinutes(new Date('2026-03-29T00:59:00Z'))).toBe(60);
    expect(berlinOffsetMinutes(new Date('2026-03-29T01:00:00Z'))).toBe(120);
  });
});

describe('Überschneidungen', () => {
  const fenster = (von: string, bis: string) => ({
    startsAt: new Date(von),
    endsAt: new Date(bis),
  });

  it('erkennt zwei Termine, die sich teilweise decken', () => {
    expect(
      overlaps(
        fenster('2026-03-10T09:00:00Z', '2026-03-10T10:00:00Z'),
        fenster('2026-03-10T09:30:00Z', '2026-03-10T10:30:00Z'),
      ),
    ).toBe(true);
  });

  it('erkennt einen Termin, der ganz in einem anderen liegt', () => {
    expect(
      overlaps(
        fenster('2026-03-10T09:00:00Z', '2026-03-10T12:00:00Z'),
        fenster('2026-03-10T10:00:00Z', '2026-03-10T11:00:00Z'),
      ),
    ).toBe(true);
  });

  it('lässt zwei Termine gelten, die aneinander anschließen', () => {
    expect(
      overlaps(
        fenster('2026-03-10T09:00:00Z', '2026-03-10T10:00:00Z'),
        fenster('2026-03-10T10:00:00Z', '2026-03-10T11:00:00Z'),
      ),
    ).toBe(false);
  });

  it('lässt sie auch in der anderen Reihenfolge gelten', () => {
    expect(
      overlaps(
        fenster('2026-03-10T10:00:00Z', '2026-03-10T11:00:00Z'),
        fenster('2026-03-10T09:00:00Z', '2026-03-10T10:00:00Z'),
      ),
    ).toBe(false);
  });

  it('sieht in einem Termin ohne Länge keinen Konflikt mit sich selbst', () => {
    const punkt = fenster('2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z');

    expect(overlaps(punkt, punkt)).toBe(false);
  });

  it('lässt zwei Termine gelten, die weit auseinander liegen', () => {
    expect(
      overlaps(
        fenster('2026-03-10T09:00:00Z', '2026-03-10T10:00:00Z'),
        fenster('2026-03-11T09:00:00Z', '2026-03-11T10:00:00Z'),
      ),
    ).toBe(false);
  });

  it('ist in beide Richtungen dasselbe', () => {
    const links = fenster('2026-03-10T09:00:00Z', '2026-03-10T11:00:00Z');
    const rechts = fenster('2026-03-10T10:00:00Z', '2026-03-10T12:00:00Z');

    expect(overlaps(links, rechts)).toBe(overlaps(rechts, links));
  });
});

describe('die Länge', () => {
  it('rechnet in Minuten', () => {
    expect(
      durationMinutes({
        startsAt: new Date('2026-03-10T09:00:00Z'),
        endsAt: new Date('2026-03-10T10:30:00Z'),
      }),
    ).toBe(90);
  });

  it('rundet angebrochene Minuten zur nächsten', () => {
    expect(
      durationMinutes({
        startsAt: new Date('2026-03-10T09:00:00Z'),
        endsAt: new Date('2026-03-10T10:30:30Z'),
      }),
    ).toBe(91);

    expect(
      durationMinutes({
        startsAt: new Date('2026-03-10T09:00:00Z'),
        endsAt: new Date('2026-03-10T10:30:20Z'),
      }),
    ).toBe(90);
  });

  it('zählt über die Umstellung die tatsächlich vergangene Zeit', () => {
    expect(
      durationMinutes({
        startsAt: instantFromBerlin('2026-03-29', '01:30'),
        endsAt: instantFromBerlin('2026-03-29', '03:30'),
      }),
    ).toBe(60);
  });
});

describe('über Mitternacht', () => {
  it('erkennt einen Termin, der in Berlin den Tag wechselt und in UTC nicht', () => {
    const fenster = {
      startsAt: instantFromBerlin('2026-03-10', '23:00'),
      endsAt: instantFromBerlin('2026-03-11', '00:30'),
    };

    expect(fenster.startsAt.toISOString().slice(0, 10)).toBe(
      fenster.endsAt.toISOString().slice(0, 10),
    );
    expect(spansMidnight(fenster)).toBe(true);
  });

  it('erkennt einen Termin, der ihn nach UTC täte und in Berlin nicht', () => {
    const fenster = {
      startsAt: instantFromBerlin('2026-01-15', '00:30'),
      endsAt: instantFromBerlin('2026-01-15', '01:30'),
    };

    expect(fenster.startsAt.toISOString().slice(0, 10)).not.toBe(
      fenster.endsAt.toISOString().slice(0, 10),
    );
    expect(spansMidnight(fenster)).toBe(false);
  });
});

describe('die betroffenen Tage', () => {
  it('nennt den einen Tag eines gewöhnlichen Termins', () => {
    expect(
      daysCovered({
        startsAt: instantFromBerlin('2026-03-10', '09:00'),
        endsAt: instantFromBerlin('2026-03-10', '10:00'),
      }),
    ).toEqual(['2026-03-10']);
  });

  it('nennt alle Tage einer mehrtägigen Reise', () => {
    expect(
      daysCovered({
        startsAt: instantFromBerlin('2026-03-10', '09:00'),
        endsAt: instantFromBerlin('2026-03-12', '17:00'),
      }),
    ).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
  });

  it('kommt über die kurze Nacht im März hinweg', () => {
    expect(
      daysCovered({
        startsAt: instantFromBerlin('2026-03-28', '20:00'),
        endsAt: instantFromBerlin('2026-03-30', '08:00'),
      }),
    ).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('zählt den langen Tag im Oktober nicht doppelt', () => {
    expect(
      daysCovered({
        startsAt: instantFromBerlin('2026-10-25', '00:30'),
        endsAt: instantFromBerlin('2026-10-26', '08:00'),
      }),
    ).toEqual(['2026-10-25', '2026-10-26']);
  });

  it('lässt bei einer langen Abwesenheit keinen Tag aus', () => {
    const tage = daysCovered({
      startsAt: instantFromBerlin('2026-10-01', '09:00'),
      endsAt: instantFromBerlin('2026-11-12', '17:00'),
    });

    expect(tage).toHaveLength(43);
    expect(tage[0]).toBe('2026-10-01');
    expect(tage[tage.length - 1]).toBe('2026-11-12');
    expect(new Set(tage).size).toBe(tage.length);

    for (let index = 1; index < tage.length; index += 1) {
      const vorher = Date.parse(`${tage[index - 1]}T00:00:00Z`);
      const jetzt = Date.parse(`${tage[index]}T00:00:00Z`);

      expect(jetzt - vorher).toBe(86_400_000);
    }
  });

  it('gibt bei einem Ende vor dem Anfang trotzdem auf', () => {
    const tage = daysCovered({
      startsAt: instantFromBerlin('2026-03-10', '09:00'),
      endsAt: instantFromBerlin('2026-03-08', '09:00'),
    });

    expect(tage.length).toBeLessThan(370);
  });
});
