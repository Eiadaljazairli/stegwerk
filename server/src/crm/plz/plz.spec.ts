import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { meintDeutschland, orteZurPlz } from './plz';
import { PlzResolver } from './plz.resolver';

describe('orteZurPlz', () => {
  it('findet den Ort einer gewöhnlichen Postleitzahl, mit Bundesland', () => {
    expect(orteZurPlz('80331')).toEqual([
      { ort: 'München', bundesland: 'Bayern' },
    ]);
    expect(orteZurPlz(' 01067 ')).toEqual([
      { ort: 'Dresden', bundesland: 'Sachsen' },
    ]);
  });

  it('nennt mehrere Orte, wenn sich mehrere eine Postleitzahl teilen', () => {
    const orte = orteZurPlz('25813').map((o) => o.ort);

    expect(orte.length).toBeGreaterThan(1);
    expect(orte).toContain('Husum');
  });

  it.each([
    ['10875', 'nur Firmen'],
    ['06095', 'Amtsgericht'],
    ['02620', 'Landratsamt Bautzen'],
    ['01730', 'Klinik Bavaria'],
    ['09106', 'Stadtverwaltung'],
    ['01095', 'Sächsische Staatskanzlei'],
    ['12345', 'Kanzlei und Krankenhaus'],
    ['20243', 'Bezirksamt und Privatperson'],
  ])('nennt für die Großempfänger-Postleitzahl %s keinen Ort (%s)', (plz) => {
    expect(orteZurPlz(plz)).toEqual([]);
  });

  it('lässt neben einem Großempfänger nur den echten Ort stehen', () => {
    expect(orteZurPlz('14461')).toEqual([
      { ort: 'Potsdam', bundesland: 'Brandenburg' },
    ]);
  });

  it('enthält keinen Namen einer Behörde, Klinik, Bank oder Firma', () => {
    const datei = JSON.parse(
      readFileSync(join(__dirname, 'plz-de.json'), 'utf8'),
    ) as { plz: Record<string, [string, number][]> };
    const verdaechtig =
      /(GmbH|\bAG\b|\bKG\b|e\.\s?V\.|Bank|Sparkasse|Versicherung|Amtsgericht|Landratsamt|Verwaltung|Klinik|Krankenhaus|Staatskanzlei|Ministerium|Agentur|Steuerberater|\bDr\.)/u;
    const treffer = Object.entries(datei.plz).flatMap(([plz, orte]) =>
      orte
        .filter(([ort]) => verdaechtig.test(ort))
        .map(([ort]) => `${plz} ${ort}`),
    );

    expect(treffer).toEqual([]);
  });

  it('behält kleine Orte mit langem Namen', () => {
    expect(orteZurPlz('89584').map((o) => o.ort)).toContain(
      'Ehingen an der Donau',
    );
  });

  it('gibt bei Unvollständigem nichts zurück statt eines Fehlers', () => {
    expect(orteZurPlz('803')).toEqual([]);
    expect(orteZurPlz('8033a')).toEqual([]);
    expect(orteZurPlz('')).toEqual([]);
  });
});

describe('meintDeutschland', () => {
  it.each(['', 'DE', 'Deutschland', ' germany '])('%s ja', (land) => {
    expect(meintDeutschland(land)).toBe(true);
  });

  it.each(['Österreich', 'AT', 'Schweiz'])('%s nein', (land) => {
    expect(meintDeutschland(land)).toBe(false);
  });
});

describe('PlzResolver', () => {
  it('schlägt nur für Deutschland nach', () => {
    const resolver = new PlzResolver();

    expect(resolver.plzOrte('50667', null)).toEqual([
      { ort: 'Köln', bundesland: 'Nordrhein-Westfalen' },
    ]);
    expect(resolver.plzOrte('50667', 'Österreich')).toEqual([]);
  });
});
