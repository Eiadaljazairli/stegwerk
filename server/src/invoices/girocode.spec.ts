import { giroCode } from './girocode';

const basis = {
  name: 'Nordwind Vertrieb GmbH',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  amountCents: 105315,
  currency: 'EUR',
  reference: 'RE-2026-0001',
};

describe('giroCode', () => {
  it('schreibt die elf Zeilen nach EPC069-12, Fassung 002', () => {
    expect(giroCode(basis)?.split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'COBADEFFXXX',
      'Nordwind Vertrieb GmbH',
      'DE89370400440532013000',
      'EUR1053.15',
      '',
      '',
      'RE-2026-0001',
    ]);
  });

  it('kommt ohne BIC aus und lässt die Zeile leer stehen', () => {
    expect(giroCode({ ...basis, bic: null })?.split('\n')[4]).toBe('');
  });

  it('schreibt Cent mit führender Null', () => {
    expect(giroCode({ ...basis, amountCents: 105 })?.split('\n')[7]).toBe(
      'EUR1.05',
    );
  });

  it('kürzt den Namen auf 70 Zeichen', () => {
    expect(
      giroCode({ ...basis, name: 'x'.repeat(90) })?.split('\n')[5],
    ).toHaveLength(70);
  });

  it.each([
    ['ohne IBAN', { iban: null }],
    ['mit falscher Prüfziffer', { iban: 'DE00370400440532013000' }],
    ['ohne Namen', { name: ' ' }],
    ['für eine Korrektur', { amountCents: -105315 }],
    ['für null Euro', { amountCents: 0 }],
    ['in Dollar', { currency: 'USD' }],
  ])('gibt es nicht %s', (_fall, aenderung) => {
    expect(giroCode({ ...basis, ...aenderung })).toBeNull();
  });
});
