import { describe, expect, it } from 'vitest';

import {
  adresseZeilen,
  datumText,
  istLinkListe,
  linkAnzeige,
  relativesDatum,
  zahlText,
} from './feldformat';

describe('Zahl', () => {
  it('zeigt Stellen und Prozent nach der Einstellung', () => {
    expect(zahlText({}, 1234.5)).toBe('1.234,5');
    expect(zahlText({ nachkommastellen: 2 }, 1234.5)).toBe('1.234,50');
    expect(zahlText({ nachkommastellen: 0 }, 2.6)).toBe('3');
    expect(zahlText({ zahlformat: 'prozent', nachkommastellen: 1 }, 12.5)).toBe(
      '12,5 %',
    );
  });
});

describe('Datum', () => {
  const heute = new Date(2026, 9, 22, 18, 30);

  it('zeigt den Tag oder relativ', () => {
    expect(datumText({}, '2026-03-12')).toBe('12.03.2026');
    expect(datumText({ datumsformat: 'relativ' }, '2026-10-22', heute)).toBe(
      'heute',
    );
  });

  it('rechnet in Kalendertagen, nicht in Stunden', () => {
    expect(relativesDatum('2026-10-23', heute)).toBe('morgen');
    expect(relativesDatum('2026-10-19', heute)).toBe('vor 3 Tagen');
    expect(relativesDatum('2026-11-12', heute)).toBe('in 3 Wochen');
    expect(relativesDatum('2027-04-22', heute)).toBe('in 6 Monaten');
  });
});

describe('Anschrift und Links', () => {
  it('setzt PLZ und Ort in eine Zeile', () => {
    expect(
      adresseZeilen({ strasse: 'Hafenstraße 1', plz: '20457', ort: 'Hamburg' }),
    ).toEqual(['Hafenstraße 1', '20457 Hamburg']);
  });

  it('macht nur https-Links anklickbar', () => {
    expect(linkAnzeige({ url: 'https://nord.de/' })).toEqual({
      text: 'nord.de',
      ziel: 'https://nord.de/',
    });
    expect(
      linkAnzeige({ url: 'javascript:alert(1)', label: 'X' }).ziel,
    ).toBeNull();
    expect(istLinkListe([{ url: 'https://a.de' }])).toBe(true);
    expect(istLinkListe(['https://a.de'])).toBe(false);
  });
});
