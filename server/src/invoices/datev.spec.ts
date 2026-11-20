import {
  alsWindows1252,
  datevBuchungsstapel,
  datevLuecken,
  erloeskonto,
  FELDNAMEN,
} from './datev';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';

const einstellungen = {
  beraternummer: '1001',
  mandantennummer: '1',
  kontenrahmen: 'SKR03' as const,
};

const jetzt = new Date('2026-10-18T09:30:15.123Z');

describe('datevBuchungsstapel', () => {
  const stapel = datevBuchungsstapel(
    einstellungen,
    [
      {
        number: 'RE-2026-0001',
        issuedOn: '2026-10-17',
        customerName: 'Alpenkraft "Maschinenbau"; AG',
        smallBusiness: false,
        taxGroups: [
          { ratePercent: 7, netCents: 10000, taxCents: 700 },
          { ratePercent: 19, netCents: 88500, taxCents: 16815 },
        ],
      },
      {
        number: 'RE-2026-0002',
        issuedOn: '2026-10-18',
        customerName: 'Alpenkraft AG',
        smallBusiness: false,
        taxGroups: [{ ratePercent: 19, netCents: -88500, taxCents: -16815 }],
      },
    ],
    '2026-10-01',
    '2026-10-31',
    jetzt,
  );
  const zeilen = stapel.split('\r\n');

  it('beginnt mit der EXTF-Kopfzeile des Mandanten', () => {
    const kopf = zeilen[0].split(';');

    expect(kopf.slice(0, 6)).toEqual([
      '"EXTF"',
      '700',
      '21',
      '"Buchungsstapel"',
      '13',
      '20261018093015123',
    ]);
    expect(kopf.slice(10, 16)).toEqual([
      '1001',
      '1',
      '20260101',
      '4',
      '20261001',
      '20261031',
    ]);
    expect(kopf[26]).toBe('"03"');
    expect(kopf).toHaveLength(31);
  });

  it('nennt die Felder in der zweiten Zeile', () => {
    expect(zeilen[1]).toBe(FELDNAMEN.join(';'));
  });

  it('bucht je Steuersatz brutto vom Sammeldebitor auf das Automatikkonto', () => {
    expect(zeilen[2].split(';')).toEqual([
      '107,00',
      '"S"',
      '"EUR"',
      '',
      '',
      '""',
      '10000',
      '8300',
      '""',
      '1710',
      '"RE-2026-0001"',
      '""',
      '',
      '"Alpenkraft ""Maschinenbau"" AG"',
    ]);
    expect(zeilen[3].split(';').slice(0, 8)).toEqual([
      '1053,15',
      '"S"',
      '"EUR"',
      '',
      '',
      '""',
      '10000',
      '8400',
    ]);
  });

  it('dreht bei einer Korrektur die Seite statt ein Minus zu schreiben', () => {
    expect(zeilen[4].split(';').slice(0, 2)).toEqual(['1053,15', '"H"']);
  });

  it('endet mit CRLF', () => {
    expect(stapel.endsWith('\r\n')).toBe(true);
    expect(zeilen).toHaveLength(6);
  });
});

describe('erloeskonto', () => {
  it.each([
    ['SKR03', 19, false, 8400],
    ['SKR03', 7, false, 8300],
    ['SKR03', 0, false, 8200],
    ['SKR03', 0, true, 8195],
    ['SKR04', 19, false, 4400],
    ['SKR04', 7, false, 4300],
    ['SKR04', 0, false, 4200],
    ['SKR04', 0, true, 4185],
  ] as const)(
    '%s, %i %%, Kleinunternehmer %p: %i',
    (skr, rate, klein, konto) => {
      expect(erloeskonto(skr, rate, klein)).toBe(konto);
    },
  );

  it.each([
    [Steuerbefreiung.REVERSE_CHARGE, 8337, 4337],
    [Steuerbefreiung.REVERSE_CHARGE_EU, 8338, 4338],
    [Steuerbefreiung.INNERGEMEINSCHAFTLICH, 8125, 4125],
    [Steuerbefreiung.AUSFUHR, 8120, 4120],
    [Steuerbefreiung.STEUERFREI, 8100, 4100],
  ] as const)('bucht 0 %% mit %s auf %i bzw. %i', (grund, skr03, skr04) => {
    expect(erloeskonto('SKR03', 0, false, grund)).toBe(skr03);
    expect(erloeskonto('SKR04', 0, false, grund)).toBe(skr04);
    expect(erloeskonto('SKR03', 19, false, grund)).toBe(8400);
    expect(erloeskonto('SKR03', 0, true, grund)).toBe(8195);
  });
});

describe('ein Stapel mit befreiten Umsätzen', () => {
  it('bucht die 0-%-Gruppe auf das Konto des Grundes', () => {
    const zeilen = datevBuchungsstapel(
      einstellungen,
      [
        {
          number: 'RE-2026-0009',
          issuedOn: '2026-10-21',
          customerName: 'Bergwerk Innsbruck GmbH',
          smallBusiness: false,
          taxExemption: Steuerbefreiung.INNERGEMEINSCHAFTLICH,
          taxGroups: [
            { ratePercent: 0, netCents: 50_000, taxCents: 0 },
            { ratePercent: 19, netCents: 10_000, taxCents: 1900 },
          ],
        },
      ],
      '2026-01-01',
      '2026-12-31',
      new Date('2026-10-21T10:00:00Z'),
    ).split('\r\n');

    expect(zeilen[2].split(';').slice(0, 9)).toEqual([
      '500,00',
      '"S"',
      '"EUR"',
      '',
      '',
      '""',
      '10000',
      '8125',
      '""',
    ]);
    expect(zeilen[3].split(';')[7]).toBe('8400');
  });
});

describe('datevLuecken', () => {
  it('ist leer mit Berater- und Mandantennummer', () => {
    expect(datevLuecken(einstellungen)).toEqual([]);
  });

  it('nennt fehlende oder falsche Nummern', () => {
    expect(
      datevLuecken({
        ...einstellungen,
        beraternummer: '12',
        mandantennummer: null,
      }),
    ).toHaveLength(2);
  });
});

describe('alsWindows1252', () => {
  it('kodiert Umlaute, ß und das Euro-Zeichen wie DATEV es liest', () => {
    expect([...alsWindows1252('Ä ß €')]).toEqual([
      0xc4, 0x20, 0xdf, 0x20, 0x80,
    ]);
  });

  it('macht aus Unbekanntem ein Fragezeichen', () => {
    expect([...alsWindows1252('😀')]).toEqual([0x3f]);
  });
});

describe('Formeln im Buchungstext', () => {
  it('bekommen ein Hochkomma, damit Excel sie nicht ausführt', () => {
    const stapel = datevBuchungsstapel(
      einstellungen,
      [
        {
          number: 'RE-2026-0003',
          issuedOn: '2026-10-17',
          customerName: '=HYPERLINK("https://boese.test","x")',
          smallBusiness: false,
          taxGroups: [{ ratePercent: 19, netCents: 100, taxCents: 19 }],
        },
      ],
      '2026-10-01',
      '2026-10-31',
      jetzt,
    );

    expect(stapel).toContain('"\'=HYPERLINK(');
    expect(stapel).not.toContain(';"=HYPERLINK(');
  });
});
