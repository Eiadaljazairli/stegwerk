import {
  abschnitte,
  abschnittsAnfang,
  kalenderwoche,
  standardFenster,
  zeitAusdruck,
  zeitLabel,
  zeitSchluessel,
} from './zeitraster';

const JETZT = new Date(2026, 9, 21, 12, 0, 0);

describe('Zeitraster', () => {
  it('beginnt eine Woche am Montag, ein Quartal am Monatsersten', () => {
    expect(abschnittsAnfang('woche', JETZT)).toEqual(new Date(2026, 9, 19));
    expect(abschnittsAnfang('monat', JETZT)).toEqual(new Date(2026, 9, 1));
    expect(abschnittsAnfang('quartal', JETZT)).toEqual(new Date(2026, 9, 1));
    expect(abschnittsAnfang('quartal', new Date(2026, 1, 14))).toEqual(
      new Date(2026, 0, 1),
    );
    expect(abschnittsAnfang('jahr', JETZT)).toEqual(new Date(2026, 0, 1));
    expect(abschnittsAnfang('woche', new Date(2026, 9, 25))).toEqual(
      new Date(2026, 9, 19),
    );
  });

  it('schreibt Schlüssel, die sich wie die Zeit sortieren', () => {
    expect(zeitSchluessel('woche', new Date(2026, 9, 19))).toBe('2026-10-19');
    expect(zeitSchluessel('monat', new Date(2026, 9, 1))).toBe('2026-10');
    expect(zeitSchluessel('quartal', new Date(2026, 9, 1))).toBe('2026-Q4');
    expect(zeitSchluessel('jahr', new Date(2026, 0, 1))).toBe('2026');
  });

  it('nennt Kalenderwochen nach ISO 8601', () => {
    expect(kalenderwoche(new Date(2026, 0, 1))).toEqual({
      woche: 1,
      jahr: 2026,
    });
    expect(kalenderwoche(new Date(2027, 0, 1))).toEqual({
      woche: 53,
      jahr: 2026,
    });
    expect(kalenderwoche(new Date(2026, 9, 19)).woche).toBe(43);
    expect(zeitLabel('woche', new Date(2026, 9, 19))).toBe('KW 43 ’26');
    expect(zeitLabel('quartal', new Date(2026, 9, 1))).toBe('Q4 26');
    expect(zeitLabel('monat', new Date(2026, 9, 1))).toBe('Okt 26');
  });

  it('zeigt ohne Zeitraum ein festes Fenster bis heute', () => {
    const wochen = abschnitte('woche', null, JETZT);

    expect(wochen).toHaveLength(12);
    expect(wochen[11].schluessel).toBe('2026-10-19');
    expect(abschnitte('quartal', 'alle', JETZT)).toHaveLength(8);
    expect(abschnitte('jahr', null, JETZT).map((a) => a.schluessel)).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]);
  });

  it('folgt dem Zeitraum der Kachel', () => {
    expect(abschnitte('monat', 'jahr', JETZT)).toHaveLength(10);
    expect(abschnitte('quartal', '365', JETZT)[0].schluessel).toBe('2025-Q4');
    expect(abschnitte('woche', '365', JETZT).length).toBeLessThanOrEqual(60);
  });

  it('baut SQL nur aus festen Teilen', () => {
    expect(zeitAusdruck('quartal', 'r."createdAt"')).toBe(
      `to_char(date_trunc('quarter', r."createdAt"), 'YYYY-"Q"Q')`,
    );
    expect(standardFenster('quartal', 'r."createdAt"')).toBe(
      `r."createdAt" >= date_trunc('quarter', (now() AT TIME ZONE 'Europe/Berlin')) - interval '21 months'`,
    );
    expect(standardFenster('woche', 'r."createdAt"')).toBe(
      `r."createdAt" >= date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')) - interval '11 weeks'`,
    );
  });

  it('nennt die Woche am Jahreswechsel mit dem Jahr ihres Donnerstags', () => {
    expect(zeitLabel('woche', new Date(2025, 11, 29))).toBe('KW 1 ’26');
    expect(zeitLabel('woche', new Date(2024, 11, 30))).toBe('KW 1 ’25');
    expect(zeitLabel('woche', new Date(2025, 11, 22))).toBe('KW 52 ’25');
  });

  it('rechnet „heute“ in Berlin, nicht in UTC', () => {
    expect(
      abschnitte('jahr', 'jahr', new Date('2026-12-31T23:30:00Z')).map(
        (a) => a.schluessel,
      ),
    ).toEqual(['2027']);
    expect(
      abschnitte('monat', null, new Date('2026-03-31T22:30:00Z')).at(-1)
        ?.schluessel,
    ).toBe('2026-04');
  });
});
