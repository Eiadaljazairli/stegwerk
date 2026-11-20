import {
  formatIban,
  isValidIban,
  isValidVatId,
  letterheadGaps,
} from './letterhead-checks';

describe('an IBAN', () => {
  it('accepts a real German one', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('accepts it with the spaces people actually type', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
  });

  it('accepts it in lower case', () => {
    expect(isValidIban('de89370400440532013000')).toBe(true);
  });

  it('accepts other countries', () => {
    expect(isValidIban('AT611904300234573201')).toBe(true);
    expect(isValidIban('NL91ABNA0417164300')).toBe(true);
  });

  it('rejects one digit transposed', () => {
    expect(isValidIban('DE89370400440532013100')).toBe(false);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidIban('DE88370400440532013000')).toBe(false);
  });

  it('rejects one that is too short', () => {
    expect(isValidIban('DE8937040044')).toBe(false);
  });

  it('rejects a bare account number', () => {
    expect(isValidIban('0532013000')).toBe(false);
  });

  it('rejects a number with no country code even when the digits check out', () => {
    expect(isValidIban('1000000000000083')).toBe(false);
    expect(isValidIban('1000000000000180')).toBe(false);
  });

  it('rejects letters in the check-digit positions even when the digits check out', () => {
    expect(isValidIban('DEAB000000001069')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidIban('')).toBe(false);
  });

  it('rejects letters where the check digits belong', () => {
    expect(isValidIban('DEXX370400440532013000')).toBe(false);
  });

  it('does not lose precision on a long one', () => {
    expect(isValidIban('MT84MALT011000012345MTLCAST001S')).toBe(true);
    expect(isValidIban('MT84MALT011000012345MTLCAST002S')).toBe(false);
  });
});

describe('printing an IBAN', () => {
  it('groups it in fours', () => {
    expect(formatIban('DE89370400440532013000')).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });

  it('regroups one that was spaced wrongly', () => {
    expect(formatIban('DE8937 040044 0532013000')).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });

  it('leaves no trailing space when it divides evenly', () => {
    expect(formatIban('NL91ABNA0417164300')).toBe('NL91 ABNA 0417 1643 00');
    expect(formatIban('AT611904300234573201')).toBe('AT61 1904 3002 3457 3201');
  });
});

describe('a VAT id', () => {
  it('accepts a German one', () => {
    expect(isValidVatId('DE123456789')).toBe(true);
  });

  it('accepts it spaced and in lower case', () => {
    expect(isValidVatId('de 123 456 789')).toBe(true);
  });

  it('rejects a German one with the wrong number of digits', () => {
    expect(isValidVatId('DE12345678')).toBe(false);
    expect(isValidVatId('DE1234567890')).toBe(false);
  });

  it('rejects a German one with letters in it', () => {
    expect(isValidVatId('DE12345678X')).toBe(false);
  });

  it('accepts other member states without second-guessing them', () => {
    expect(isValidVatId('ATU12345678')).toBe(true);
    expect(isValidVatId('NL123456789B01')).toBe(true);
  });

  it('rejects something with no country at all', () => {
    expect(isValidVatId('123456789')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidVatId('')).toBe(false);
  });
});

describe('what is still missing', () => {
  const complete = {
    companyName: 'Nordwind Logistik GmbH',
    street: 'Hafenstraße 12',
    postalCode: '20457',
    city: 'Hamburg',
    representative: 'Anna Schmidt',
    taxNumber: '22/815/00123',
    vatId: null,
    iban: 'DE89370400440532013000',
  };

  it('finds nothing wrong with a complete one', () => {
    expect(letterheadGaps(complete)).toEqual([]);
  });

  it('asks for the company name before anything else when there is no letterhead', () => {
    expect(letterheadGaps(null)).toEqual([
      { field: 'companyName', label: 'Firmenname' },
    ]);
  });

  it('accepts a VAT id instead of a Steuernummer', () => {
    expect(
      letterheadGaps({ ...complete, taxNumber: null, vatId: 'DE123456789' }),
    ).toEqual([]);
  });

  it('names the tax line when neither is there', () => {
    expect(
      letterheadGaps({ ...complete, taxNumber: null, vatId: null }),
    ).toEqual([{ field: 'taxNumber', label: 'Steuernummer oder USt-IdNr.' }]);
  });

  it('treats a field of spaces as missing', () => {
    expect(letterheadGaps({ ...complete, companyName: '   ' })).toEqual([
      { field: 'companyName', label: 'Firmenname' },
    ]);
  });

  it('names the place when either half of it is missing', () => {
    expect(letterheadGaps({ ...complete, postalCode: null })).toEqual([
      { field: 'city', label: 'PLZ und Ort' },
    ]);
    expect(letterheadGaps({ ...complete, city: null })).toEqual([
      { field: 'city', label: 'PLZ und Ort' },
    ]);
  });

  it('asks for the IBAN, because a quote says where to pay', () => {
    expect(letterheadGaps({ ...complete, iban: null })).toEqual([
      { field: 'iban', label: 'IBAN' },
    ]);
  });

  it('asks for the representative, which §35a requires', () => {
    expect(letterheadGaps({ ...complete, representative: null })).toEqual([
      { field: 'representative', label: 'Vertretungsberechtigte:r' },
    ]);
  });

  it('lists everything missing at once, in the order of the form', () => {
    expect(
      letterheadGaps({
        companyName: null,
        street: null,
        postalCode: null,
        city: null,
        representative: null,
        taxNumber: null,
        vatId: null,
        iban: null,
      }).map((gap) => gap.field),
    ).toEqual([
      'companyName',
      'street',
      'city',
      'representative',
      'taxNumber',
      'iban',
    ]);
  });
});
