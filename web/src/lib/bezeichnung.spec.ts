import { describe, expect, it } from 'vitest';

import {
  akkusativUnsicher,
  anzahl,
  bezeichnungenAus,
  eingabeFehler,
  form,
  leerText,
  type ObjektBezeichnung,
  seitenName,
  spalteBenennen,
  STANDARD_BEZEICHNUNGEN,
} from './bezeichnung';

const patient = {
  einzahl: 'Patient',
  mehrzahl: 'Patienten',
  genus: 'MAENNLICH' as const,
};

const vomServer = (
  teil: Partial<ObjektBezeichnung> & Pick<ObjektBezeichnung, 'art'>,
): ObjektBezeichnung => ({
  ...STANDARD_BEZEICHNUNGEN[teil.art],
  istStandard: false,
  standardEinzahl: STANDARD_BEZEICHNUNGEN[teil.art].einzahl,
  standardMehrzahl: STANDARD_BEZEICHNUNGEN[teil.art].mehrzahl,
  ...teil,
});

describe('Grammatik', () => {
  it('bildet „Neue/Neuer/Neues“ nach dem Geschlecht', () => {
    expect(form(STANDARD_BEZEICHNUNGEN.FIRMA, 'neu')).toBe('Neue Firma');
    expect(form(STANDARD_BEZEICHNUNGEN.KONTAKT, 'neu')).toBe('Neuer Kontakt');
    expect(form(STANDARD_BEZEICHNUNGEN.GESCHAEFT, 'neu')).toBe(
      'Neues Geschäft',
    );
  });

  it('bildet den Akkusativ für „… anlegen“', () => {
    expect(form(STANDARD_BEZEICHNUNGEN.AUFGABE, 'ersten')).toBe(
      'Erste Aufgabe',
    );
    expect(form(STANDARD_BEZEICHNUNGEN.KONTAKT, 'ersten')).toBe(
      'Ersten Kontakt',
    );
    expect(form(STANDARD_BEZEICHNUNGEN.ANGEBOT, 'ersten')).toBe(
      'Erstes Angebot',
    );
  });

  it('bildet bei eigenen männlichen Wörtern keinen falschen Akkusativ', () => {
    expect(form(patient, 'ersten')).toBe('Patient');
    expect(
      form(
        { einzahl: 'Kunde', mehrzahl: 'Kunden', genus: 'MAENNLICH' },
        'ersten',
      ),
    ).toBe('Kunde');
    expect(
      form(
        { einzahl: 'Behandlung', mehrzahl: 'Behandlungen', genus: 'WEIBLICH' },
        'ersten',
      ),
    ).toBe('Erste Behandlung');
    expect(
      form(
        { einzahl: 'Projekt', mehrzahl: 'Projekte', genus: 'SAECHLICH' },
        'ersten',
      ),
    ).toBe('Erstes Projekt');
  });

  it('weiß, wann der Akkusativ unsicher ist', () => {
    expect(akkusativUnsicher(STANDARD_BEZEICHNUNGEN.KONTAKT)).toBe(false);
    expect(akkusativUnsicher(STANDARD_BEZEICHNUNGEN.FIRMA)).toBe(false);
    expect(akkusativUnsicher(patient)).toBe(true);
  });

  it('kennt Mehrzahl, „Noch keine“ und „Diese/Dieser/Dieses“', () => {
    expect(form(patient, 'mehrzahl')).toBe('Patienten');
    expect(form(patient, 'keine')).toBe('Noch keine Patienten');
    expect(form(STANDARD_BEZEICHNUNGEN.FIRMA, 'diese')).toBe('Diese Firma');
    expect(form(patient, 'diese')).toBe('Dieser Patient');
    expect(form(STANDARD_BEZEICHNUNGEN.GESCHAEFT, 'diese')).toBe(
      'Dieses Geschäft',
    );
  });

  it('zählt Einzahl nur bei genau eins', () => {
    expect(anzahl(patient, 1)).toBe('Patient');
    expect(anzahl(patient, 0)).toBe('Patienten');
    expect(anzahl(patient, 2)).toBe('Patienten');
  });
});

describe('bezeichnungenAus', () => {
  it('fällt ohne Antwort auf die Wörter des Programms zurück', () => {
    expect(bezeichnungenAus(undefined)).toEqual(STANDARD_BEZEICHNUNGEN);
    expect(bezeichnungenAus([])).toEqual(STANDARD_BEZEICHNUNGEN);
  });

  it('legt die eigene Bezeichnung über den Standard', () => {
    const b = bezeichnungenAus([vomServer({ art: 'KONTAKT', ...patient })]);

    expect(b.KONTAKT).toEqual(patient);
    expect(b.FIRMA).toEqual(STANDARD_BEZEICHNUNGEN.FIRMA);
  });

  it('übergeht leere Wörter', () => {
    const b = bezeichnungenAus([
      vomServer({ art: 'FIRMA', einzahl: ' ', mehrzahl: '' }),
    ]);

    expect(b.FIRMA).toEqual(STANDARD_BEZEICHNUNGEN.FIRMA);
  });

  it('verändert den Standard nicht', () => {
    bezeichnungenAus([vomServer({ art: 'KONTAKT', ...patient })]);

    expect(STANDARD_BEZEICHNUNGEN.KONTAKT.einzahl).toBe('Kontakt');
  });
});

describe('seitenName', () => {
  const b = bezeichnungenAus([vomServer({ art: 'KONTAKT', ...patient })]);

  it('nennt die Objektseiten nach der Mehrzahl', () => {
    expect(seitenName(b, '/kontakte', 'Kontakte')).toBe('Patienten');
    expect(seitenName(b, '/firmen', 'Firmen')).toBe('Firmen');
  });

  it('lässt andere Seiten, wie sie heißen', () => {
    expect(seitenName(b, '/kalender', 'Kalender')).toBe('Kalender');
    expect(seitenName(b, '/artikel', 'Artikel')).toBe('Artikel');
  });
});

describe('leerText', () => {
  it('behält den erklärenden Satz beim Standard', () => {
    expect(
      leerText(STANDARD_BEZEICHNUNGEN.KONTAKT, 'KONTAKT', 'Fester Satz.'),
    ).toBe('Fester Satz.');
  });

  it('sagt es umbenannt in der Mehrzahl', () => {
    expect(leerText(patient, 'KONTAKT', 'Fester Satz.', true)).toBe(
      'Legen Sie Ihre ersten Patienten an oder importieren Sie eine Liste.',
    );
    expect(leerText(patient, 'KONTAKT', 'Fester Satz.')).toBe(
      'Legen Sie Ihre ersten Patienten an.',
    );
  });
});

describe('spalteBenennen', () => {
  it('benennt nur die gemeinte Spalte um', () => {
    const spalten = [
      { key: 'name', label: 'Name' },
      { key: 'company', label: 'Firma' },
    ].map(spalteBenennen('company', 'Praxis'));

    expect(spalten.map((s) => s.label)).toEqual(['Name', 'Praxis']);
  });
});

describe('eingabeFehler', () => {
  it('verlangt beide Formen', () => {
    expect(eingabeFehler('', 'Patienten')).toBe(
      'Bitte geben Sie die Einzahl an.',
    );
    expect(eingabeFehler('Patient', '  ')).toBe(
      'Bitte geben Sie die Mehrzahl an.',
    );
  });

  it('begrenzt die Länge wie der Server', () => {
    expect(eingabeFehler('A'.repeat(31), 'B')).toMatch(/höchstens 30/u);
    expect(eingabeFehler('Patient', 'Patienten')).toBeNull();
  });
});
