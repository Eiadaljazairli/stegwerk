import {
  adresseLesen,
  adresseText,
  httpsLink,
  linksLesen,
  linksText,
  WertFehler,
} from './zusammengesetzt';

describe('Anschrift', () => {
  it('liest eine Zeile mit PLZ in ihre Teile', () => {
    expect(
      adresseLesen('Hafenstraße 1, Hinterhaus, 20457 Hamburg, Deutschland'),
    ).toEqual({
      strasse: 'Hafenstraße 1',
      zusatz: 'Hinterhaus',
      plz: '20457',
      ort: 'Hamburg',
      land: 'Deutschland',
    });
  });

  it('nimmt mit zwei Teilen nach dem Ort Bundesland und Land', () => {
    expect(adresseLesen('Ring 2, 1010 Wien, Wien, Österreich')).toEqual({
      strasse: 'Ring 2',
      plz: '1010',
      ort: 'Wien',
      bundesland: 'Wien',
      land: 'Österreich',
    });
  });

  it('nimmt ohne PLZ den letzten Teil als Ort', () => {
    expect(adresseLesen('Am Markt 3, Lübeck')).toEqual({
      strasse: 'Am Markt 3',
      ort: 'Lübeck',
    });
  });

  it('liest ein Objekt und JSON und lässt leere Teile weg', () => {
    expect(adresseLesen({ ort: ' Kiel ', plz: '' })).toEqual({ ort: 'Kiel' });
    expect(adresseLesen('{"strasse":"Weg 1","ort":"Bonn"}')).toEqual({
      strasse: 'Weg 1',
      ort: 'Bonn',
    });
    expect(adresseLesen({ ort: '  ' })).toBeNull();
    expect(adresseLesen('')).toBeNull();
  });

  it('weist unbekannte Teile und zu lange Werte ab', () => {
    expect(() => adresseLesen({ stadt: 'Kiel' })).toThrow(WertFehler);
    expect(() => adresseLesen({ ort: 'x'.repeat(201) })).toThrow(WertFehler);
    expect(() => adresseLesen({ ort: 3 })).toThrow(WertFehler);
    expect(() => adresseLesen(['Kiel'])).toThrow(WertFehler);
  });

  it('kommt aus dem Export so zurück, wie sie hineinging', () => {
    const adresse = {
      strasse: 'Hafenstraße 1',
      zusatz: '3. OG',
      plz: '20457',
      ort: 'Hamburg',
      bundesland: 'Hamburg',
      land: 'Deutschland',
    };

    expect(adresseLesen(adresseText(adresse))).toEqual(adresse);
  });
});

describe('Links', () => {
  it('setzt https:// vorn und weist anderes ab', () => {
    expect(httpsLink('linkedin.com/company/nordwind')).toBe(
      'https://linkedin.com/company/nordwind',
    );
    expect(() => httpsLink('http://nordwind.de')).toThrow(WertFehler);
    expect(() => httpsLink('javascript:alert(1)')).toThrow(WertFehler);
    expect(() => httpsLink('nordwind')).toThrow(WertFehler);
  });

  it('liest Text mit Bezeichnung, so wie der Export ihn schreibt', () => {
    const links = [
      { url: 'https://nordwind.de/', label: 'Website' },
      { url: 'https://linkedin.com/company/nordwind' },
    ];

    expect(linksText(links)).toBe(
      'https://nordwind.de/ (Website); https://linkedin.com/company/nordwind',
    );
    expect(linksLesen(linksText(links))).toEqual(links);
  });

  it('liest eine Liste, JSON und mehrere Links durch Leerzeichen getrennt', () => {
    expect(linksLesen(['nordwind.de'])).toEqual([
      { url: 'https://nordwind.de/' },
    ]);
    expect(linksLesen('[{"url":"https://a.de","label":" A "}]')).toEqual([
      { url: 'https://a.de/', label: 'A' },
    ]);
    expect(linksLesen('https://a.de https://b.de')).toEqual([
      { url: 'https://a.de/' },
      { url: 'https://b.de/' },
    ]);
    expect(linksLesen([{ url: ' ' }])).toBeNull();
  });

  it('nimmt höchstens zehn', () => {
    expect(() =>
      linksLesen(
        Array.from({ length: 11 }, (_, i) => `https://a${String(i)}.de`),
      ),
    ).toThrow(WertFehler);
  });
});
