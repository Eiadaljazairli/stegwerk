import { describe, expect, it } from 'vitest';

import {
  alsKlartext,
  erwaehnung,
  offeneErwaehnung,
  schalteHaken,
  zerlege,
  zerlegeZeile,
} from './formatierter-text';

const ANNA = '6f1c2a3b-0000-4000-8000-000000000001';

describe('formatierter Text', () => {
  it('lässt eine alte Notiz ohne Auszeichnung, wie sie ist', () => {
    expect(zerlege('Erste Zeile\nzweite Zeile\n\nNeuer Absatz')).toEqual([
      {
        art: 'absatz',
        inhalt: [
          { art: 'text', text: 'Erste Zeile' },
          { art: 'umbruch' },
          { art: 'text', text: 'zweite Zeile' },
        ],
      },
      { art: 'absatz', inhalt: [{ art: 'text', text: 'Neuer Absatz' }] },
    ]);
  });

  it('erkennt Überschriften, Listen und Checklisten', () => {
    const bloecke = zerlege(
      '# Besuch\n- eins\n- zwei\n1. erstens\n2. zweitens\n- [ ] offen\n- [x] fertig',
    );

    expect(bloecke.map((block) => block.art)).toEqual([
      'ueberschrift',
      'liste',
      'liste',
      'checkliste',
    ]);
    expect(bloecke[3]).toMatchObject({
      punkte: [
        { erledigt: false, nummer: 0 },
        { erledigt: true, nummer: 1 },
      ],
    });
  });

  it('kennt fett, kursiv, Links und Erwähnungen', () => {
    expect(
      zerlegeZeile(
        `**Wichtig**: *bald* [Angebot](https://x.de) an @[Anna Pruefer](nutzer:${ANNA})`,
      ),
    ).toEqual([
      { art: 'fett', kinder: [{ art: 'text', text: 'Wichtig' }] },
      { art: 'text', text: ': ' },
      { art: 'kursiv', kinder: [{ art: 'text', text: 'bald' }] },
      { art: 'text', text: ' ' },
      {
        art: 'link',
        ziel: 'https://x.de',
        kinder: [{ art: 'text', text: 'Angebot' }],
      },
      { art: 'text', text: ' an ' },
      { art: 'erwaehnung', name: 'Anna Pruefer', id: ANNA },
    ]);
  });

  it('nimmt Rechnungen und Namen mit * oder _ nicht als Betonung', () => {
    expect(alsKlartext('5 * 3 * 2 und kunden_nr_alt')).toBe(
      '5 * 3 * 2 und kunden_nr_alt',
    );
    expect(zerlegeZeile('a*b*c')).toEqual([{ art: 'text', text: 'a*b*c' }]);
  });

  it('macht aus javascript:, data: und relativen Zielen keinen Link', () => {
    for (const zeile of [
      '[klick](javascript:alert(1))',
      '[klick](JavaScript:alert)',
      '[x](data:text/html,<script>)',
      '[x](vbscript:msgbox)',
      '[x](/firmen)',
      '[x](//boese.example)',
    ]) {
      expect(zerlegeZeile(zeile).some((stueck) => stueck.art === 'link')).toBe(
        false,
      );
    }
  });

  it('macht nackte Adressen zu Links, ohne das Satzzeichen danach', () => {
    expect(zerlegeZeile('Siehe https://stegwerk.com/hilfe.')).toEqual([
      { art: 'text', text: 'Siehe ' },
      {
        art: 'link',
        ziel: 'https://stegwerk.com/hilfe',
        kinder: [{ art: 'text', text: 'https://stegwerk.com/hilfe' }],
      },
      { art: 'text', text: '.' },
    ]);
  });

  it('lässt HTML Text bleiben', () => {
    expect(zerlegeZeile('<img src=x onerror=alert(1)>')).toEqual([
      { art: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('hakt den richtigen Punkt an und ab', () => {
    const text = '- [ ] eins\nText\n- [x] zwei\n- [ ] drei';

    expect(schalteHaken(text, 1)).toBe(
      '- [ ] eins\nText\n- [ ] zwei\n- [ ] drei',
    );
    expect(schalteHaken(text, 2)).toBe(
      '- [ ] eins\nText\n- [x] zwei\n- [x] drei',
    );
  });

  it('zeichnet maskierte Zeichen als Text, etwa aus dem Webformular', () => {
    expect(
      zerlegeZeile(
        `\\@\\[Chef\\]\\(nutzer:${ANNA}\\) \\[Rechnung\\]\\(https://phish.test\\) \\*x\\* C:\\\\Daten`,
      ),
    ).toEqual([
      { art: 'text', text: `@[Chef](nutzer:${ANNA}) [Rechnung](` },
      {
        art: 'link',
        ziel: 'https://phish.test',
        kinder: [{ art: 'text', text: 'https://phish.test' }],
      },
      { art: 'text', text: ') *x* C:\\Daten' },
    ]);
    expect(zerlege('\\# Kein Titel')).toEqual([
      { art: 'absatz', inhalt: [{ art: 'text', text: '# Kein Titel' }] },
    ]);
  });

  it('nimmt maskierte Zeichen in eine nackte Adresse mit auf', () => {
    expect(zerlegeZeile('https://x.de/foo\\_bar\\#teil.')).toEqual([
      {
        art: 'link',
        ziel: 'https://x.de/foo_bar#teil',
        kinder: [{ art: 'text', text: 'https://x.de/foo_bar#teil' }],
      },
      { art: 'text', text: '.' },
    ]);
    expect(zerlegeZeile('https://x.de/foo_bar#teil')).toEqual([
      {
        art: 'link',
        ziel: 'https://x.de/foo_bar#teil',
        kinder: [{ art: 'text', text: 'https://x.de/foo_bar#teil' }],
      },
    ]);
  });

  it('hakt bei Windows-Zeilenenden den richtigen Punkt an', () => {
    expect(schalteHaken('- [ ] a\r\n- [ ] b\r\n- [ ] c', 0)).toBe(
      '- [x] a\n- [ ] b\n- [ ] c',
    );
    expect(schalteHaken('- [ ] a\r\n- [ ] b\r\n- [ ] c', 1)).toBe(
      '- [ ] a\n- [x] b\n- [ ] c',
    );
  });

  it('findet das @, an dem gerade getippt wird', () => {
    expect(offeneErwaehnung('Hallo @An', 9)).toEqual({ start: 6, suche: 'An' });
    expect(offeneErwaehnung('Hallo @Anna Pr', 14)).toEqual({
      start: 6,
      suche: 'Anna Pr',
    });
    expect(offeneErwaehnung('mail@firma.de', 13)).toBe(null);
    expect(offeneErwaehnung('@Anna hat heute angerufen', 25)).toBe(null);
  });

  it('schreibt eine Erwähnung ohne Klammern im Namen', () => {
    expect(erwaehnung('Anna [Chefin]', ANNA)).toBe(
      `@[Anna Chefin](nutzer:${ANNA})`,
    );
  });
});
