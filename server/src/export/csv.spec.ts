import {
  BOM,
  csvHeader,
  csvLine,
  csvRow,
  escapeCell,
  formatCell,
  sniffDelimiter,
} from './csv';

describe('escaping a cell', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeCell('Nordwind Logistik')).toBe('Nordwind Logistik');
  });

  it('quotes a cell containing the delimiter', () => {
    expect(escapeCell('Muster; Hans')).toBe('"Muster; Hans"');
  });

  it('doubles a quote inside a quoted cell', () => {
    expect(escapeCell('Der "Große" GmbH')).toBe('"Der ""Große"" GmbH"');
  });

  it('quotes a cell containing a newline', () => {
    expect(escapeCell('Hafenstraße 12\n20457 Hamburg')).toBe(
      '"Hafenstraße 12\n20457 Hamburg"',
    );
  });

  it('quotes a cell containing a carriage return', () => {
    expect(escapeCell('a\rb')).toBe('"a\rb"');
  });

  it('leaves an empty cell empty rather than quoting it', () => {
    expect(escapeCell('')).toBe('');
  });
});

describe('cells Excel would run as a formula', () => {
  it('defuses one starting with an equals sign', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1");
  });

  it('defuses the other three starts', () => {
    expect(escapeCell('+49 40 123')).toBe("'+49 40 123");
    expect(escapeCell('-5')).toBe("'-5");
    expect(escapeCell('@handle')).toBe("'@handle");
  });

  it('still quotes a defused cell that also holds a delimiter', () => {
    expect(escapeCell('=A1;B1')).toBe('"\'=A1;B1"');
  });

  it('leaves a formula character in the middle alone', () => {
    expect(escapeCell('Meyer-Schmidt')).toBe('Meyer-Schmidt');
    expect(escapeCell('a=b')).toBe('a=b');
  });
});

describe('formatting a value', () => {
  it('writes nothing for nothing', () => {
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
  });

  it('writes a number the German way', () => {
    expect(formatCell(1234.56)).toBe('1.234,56');
    expect(formatCell(48_500)).toBe('48.500');
  });

  it('keeps enough decimals for a rate or a quantity', () => {
    expect(formatCell(0.333)).toBe('0,333');
  });

  it('writes a yes or no', () => {
    expect(formatCell(true)).toBe('Ja');
    expect(formatCell(false)).toBe('Nein');
  });

  it('turns an ISO date around', () => {
    expect(formatCell('2026-03-04')).toBe('04.03.2026');
    expect(formatCell('2026-03-04T10:00:00.000Z')).toBe('04.03.2026');
  });

  it('turns a Date around', () => {
    expect(formatCell(new Date(2026, 2, 4))).toBe('04.03.2026');
  });

  it('does not mistake text for a date', () => {
    expect(formatCell('2026-03 war gut')).toBe('2026-03 war gut');
  });

  it('only reformats a date the cell starts with', () => {
    expect(formatCell('Vertrag 2026-03-04 unterschrieben')).toBe(
      'Vertrag 2026-03-04 unterschrieben',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(formatCell('Hamburg')).toBe('Hamburg');
  });
});

describe('a whole line', () => {
  it('joins with a semicolon, which is what German Excel splits on', () => {
    expect(csvLine(['Nordwind', 'Hamburg', 240])).toBe('Nordwind;Hamburg;240');
  });

  it('formats and escapes each cell on the way', () => {
    expect(csvLine(['Muster; Hans', 1234.5, null, true])).toBe(
      '"Muster; Hans";1.234,5;;Ja',
    );
  });

  it('ends a row with CRLF, as the format asks', () => {
    expect(csvRow(['a'])).toBe('a\r\n');
  });
});

describe('the header', () => {
  it('starts with the byte-order mark', () => {
    const header = csvHeader(['Name']);

    expect(Buffer.from(header, 'utf8').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
    expect(header.startsWith(BOM)).toBe(true);
  });

  it('names the columns and ends the line', () => {
    expect(csvHeader(['Name', 'Ort'])).toBe(`${BOM}Name;Ort\r\n`);
  });

  it('escapes a heading like any other cell', () => {
    expect(csvHeader(['Umsatz; netto'])).toBe(`${BOM}"Umsatz; netto"\r\n`);
  });
});

describe('reading a file back', () => {
  it('finds the semicolon our own export writes', () => {
    expect(
      sniffDelimiter('Name;Ort;Branche\r\nNordwind;Hamburg;Logistik'),
    ).toBe(';');
  });

  it('finds the comma every other tool writes', () => {
    expect(sniffDelimiter('Name,Ort\nNordwind,Hamburg')).toBe(',');
  });

  it('ignores separators inside a quoted heading', () => {
    expect(sniffDelimiter('"Nach, Ort, Land, Datum";Ort;Land')).toBe(';');
  });

  it('sees past a byte-order mark', () => {
    expect(sniffDelimiter(`${BOM}Name;Ort`)).toBe(';');
  });

  it('reads only the first line', () => {
    expect(sniffDelimiter('Name,Ort\nNordwind;Hamburg;a;b;c')).toBe(',');
    expect(sniffDelimiter('Name,Ort\nNordwind,"a;b;c;d;e"')).toBe(',');
  });

  it('answers comma for a file with no separator at all', () => {
    expect(sniffDelimiter('Name\nNordwind')).toBe(',');
  });

  it('answers comma for an empty file rather than failing', () => {
    expect(sniffDelimiter('')).toBe(',');
  });
});
