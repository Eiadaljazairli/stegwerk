import { describe, expect, it } from 'vitest';

import { feldFuerSpalte, ordneSpaltenZu } from './spaltenZuordnung';

const KONTAKT = [
  { name: 'firstName', label: 'Vorname' },
  { name: 'lastName', label: 'Nachname' },
  { name: 'email', label: 'E-Mail' },
  { name: 'phone', label: 'Telefon' },
  { name: 'jobTitle', label: 'Position' },
  { name: 'companyName', label: 'Firma (Name)' },
];

describe('Spalten zuordnen', () => {
  it('erkennt Outlook- und englische Namen', () => {
    expect(feldFuerSpalte('First Name', KONTAKT)).toBe('firstName');
    expect(feldFuerSpalte('E-Mail-Adresse', KONTAKT)).toBe('email');
    expect(feldFuerSpalte('Company', KONTAKT)).toBe('companyName');
    expect(feldFuerSpalte('Telefon geschäftlich', KONTAKT)).toBe('phone');
  });

  it('verzeiht einen Tippfehler, aber nicht bei kurzen Namen', () => {
    expect(feldFuerSpalte('Nachnmae', KONTAKT)).toBe('lastName');
    expect(feldFuerSpalte('Tal', KONTAKT)).toBe('');
  });

  it('lässt Unbekanntes leer', () => {
    expect(feldFuerSpalte('Lieblingsfarbe', KONTAKT)).toBe('');
  });

  it('gibt ein Feld nur einer Spalte', () => {
    expect(ordneSpaltenZu(['Mobil', 'Telefon', 'Name'], KONTAKT)).toEqual({
      Mobil: '',
      Telefon: 'phone',
      Name: '',
    });
  });

  it('legt Mobil, Fax und die zweite Adresse auf die weiteren Felder', () => {
    const mitWeiteren = [
      ...KONTAKT,
      { name: 'emailWeitere', label: 'E-Mail 2' },
      { name: 'emailPrivat', label: 'E-Mail privat' },
      { name: 'telefonMobil', label: 'Telefon mobil' },
      { name: 'telefonPrivat', label: 'Telefon privat' },
      { name: 'telefonFax', label: 'Fax' },
    ];

    expect(
      ordneSpaltenZu(
        [
          'E-Mail-Adresse',
          'E-Mail 2: Adresse',
          'Telefon',
          'Mobiltelefon',
          'Fax geschäftlich',
        ],
        mitWeiteren,
      ),
    ).toEqual({
      'E-Mail-Adresse': 'email',
      'E-Mail 2: Adresse': 'emailWeitere',
      Telefon: 'phone',
      Mobiltelefon: 'telefonMobil',
      'Fax geschäftlich': 'telefonFax',
    });
  });
});
