import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { CreateCompanyInput, UpdateCompanyInput } from './company.dto';
import { CreateContactInput } from './contact.dto';
import { CreateDealInput, UpdateDealInput } from './deal.dto';

const saetze = (fehler: ValidationError[]): string[] =>
  fehler.flatMap((eintrag) => [
    ...Object.values(eintrag.constraints ?? {}),
    ...saetze(eintrag.children ?? []),
  ]);

const meldungen = async (
  klasse: new () => object,
  werte: Record<string, unknown>,
): Promise<string[]> => saetze(await validate(plainToInstance(klasse, werte)));

describe('Grenzen in den Eingaben', () => {
  it('lehnt Beträge ab, die nicht in numeric(14,2) passen', async () => {
    expect(
      await meldungen(CreateDealInput, { name: 'Groß', amount: 1e15 }),
    ).toEqual(['Der Betrag darf höchstens 999.999.999.999,99 betragen.']);
    expect(
      await meldungen(CreateDealInput, {
        name: 'Gerade noch',
        amount: 999_999_999_999.99,
      }),
    ).toEqual([]);
    expect(
      await meldungen(UpdateCompanyInput, {
        id: '7d1f3c2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f',
        annualRevenue: 1e13,
      }),
    ).toEqual(['Der Jahresumsatz darf höchstens 999.999.999.999,99 betragen.']);
  });

  it('lehnt negative Beträge ab', async () => {
    expect(
      await meldungen(CreateDealInput, { name: 'Minus', amount: -1 }),
    ).toEqual(['Der Betrag darf nicht negativ sein.']);
    expect(
      await meldungen(CreateCompanyInput, { name: 'Minus', annualRevenue: -5 }),
    ).toEqual(['Der Jahresumsatz darf nicht negativ sein.']);
  });

  it('lehnt Namen nur aus Leerzeichen ab', async () => {
    expect(await meldungen(CreateDealInput, { name: '   ' })).toEqual([
      'Der Name darf nicht leer sein.',
    ]);
    expect(await meldungen(CreateCompanyInput, { name: '\t' })).toEqual([
      'Der Name darf nicht leer sein.',
    ]);
    expect(
      await meldungen(CreateContactInput, { firstName: ' ', lastName: 'Ok' }),
    ).toEqual(['Der Vorname darf nicht leer sein.']);
    expect(await meldungen(CreateDealInput, { name: ' Mit Rand ' })).toEqual(
      [],
    );
  });

  it('lehnt Telefonnummern ohne eine Ziffer ab, Durchwahlen nicht', async () => {
    const kontakt = { firstName: 'Ina', lastName: 'Berg' };
    const meldung = ['Eine Telefonnummer braucht mindestens eine Ziffer.'];

    expect(
      await meldungen(CreateContactInput, { ...kontakt, phone: 'abc' }),
    ).toEqual(meldung);
    expect(
      await meldungen(CreateContactInput, {
        ...kontakt,
        weitereTelefone: [{ art: 'mobil', wert: 'siehe Zentrale' }],
      }),
    ).toEqual(meldung);

    for (const phone of ['-23', '+49 (0)89 123456', '0171/123 45 67', '']) {
      expect(
        await meldungen(CreateContactInput, { ...kontakt, phone }),
      ).toEqual([]);
    }
  });

  it('kennt nur Tage, die es gibt', async () => {
    expect(
      await meldungen(UpdateDealInput, {
        id: '7d1f3c2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f',
        closeDate: '2027-02-30',
      }),
    ).toEqual(['Dieses Abschlussdatum gibt es nicht.']);
    expect(
      await meldungen(CreateDealInput, {
        name: 'Schalttag',
        closeDate: '2028-02-29',
      }),
    ).toEqual([]);
  });
});
