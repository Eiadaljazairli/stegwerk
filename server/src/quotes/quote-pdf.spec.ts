import { inflateSync } from 'node:zlib';

import {
  columnsFor,
  footerColumns,
  formatAmount,
  formatIsoDate,
  formatQuantity,
  type PdfLetterhead,
  type PdfLine,
  type QuotePdfInput,
  renderQuotePdf,
} from './quote-pdf';
import { quoteTotals } from './quote-totals';
import { Steuerbefreiung } from './steuerbefreiung';

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x84: '„',
  0x85: '…',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
};

const decodeWinAnsi = (bytes: Buffer): string =>
  [...bytes]
    .map((byte) => WIN_ANSI_HIGH[byte] ?? String.fromCharCode(byte))
    .join('');

const textOf = (pdf: Buffer): string => {
  const out: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)endstream/gu;
  let match = streams.exec(pdf.toString('latin1'));

  while (match !== null) {
    const raw = Buffer.from(match[1], 'latin1');
    let content: string;

    try {
      content = inflateSync(raw).toString('latin1');
    } catch {
      content = raw.toString('latin1');
    }

    const blocks = /BT([\s\S]*?)ET/gu;
    let block = blocks.exec(content);

    while (block !== null) {
      const hex = [...block[1].matchAll(/<([0-9a-fA-F]*)>/gu)]
        .map((piece) => piece[1])
        .join('');

      if (hex !== '') {
        out.push(decodeWinAnsi(Buffer.from(hex, 'hex')));
      }

      block = blocks.exec(content);
    }

    match = streams.exec(pdf.toString('latin1'));
  }

  return out.join('\n');
};

const countPages = (pdf: Buffer): number =>
  Math.max(
    ...(pdf.toString('latin1').match(/\/Count\s+\d+/gu) ?? ['/Count 0']).map(
      (entry) => Number(entry.replace(/\D/gu, '')),
    ),
  );

const line = (over: Partial<PdfLine> = {}): PdfLine => ({
  position: 0,
  name: 'Beratung',
  articleNumber: null,
  description: null,
  quantity: 1,
  unit: 'Stunde',
  unitPriceCents: 9000,
  discountPercent: 0,
  taxRatePercent: 19,
  ...over,
});

const letterhead: PdfLetterhead = {
  companyName: 'Nordwind Logistik GmbH',
  street: 'Hafenstraße 12',
  postalCode: '20457',
  city: 'Hamburg',
  country: 'Deutschland',
  phone: '040 123456',
  email: 'info@nordwind-logistik.de',
  website: 'nordwind-logistik.de',
  representative: 'Anna Schmidt',
  registerEntry: 'Amtsgericht Hamburg HRB 123456',
  taxNumber: '22/815/00123',
  vatId: 'DE123456789',
  bankName: 'Hamburger Sparkasse',
  iban: 'DE89370400440532013000',
  bic: 'HASPDEHHXXX',
};

const quote = (over: Partial<QuotePdfInput> = {}): QuotePdfInput => {
  const lines = over.lines ?? [line()];

  return {
    number: 'AN-2026-0001',
    issuedOn: '2026-09-03',
    validUntil: '2026-10-03',
    recipientAddress:
      'Südwind KG\nz. Hd. Frau Weber\nSeestraße 4\n80331 München',
    introText: 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen an:',
    closingText: 'Wir freuen uns auf Ihre Rückmeldung.',
    smallBusiness: false,
    contactName: 'Anna Schmidt',
    totals: quoteTotals(lines, over.smallBusiness ?? false),
    letterhead,
    ...over,
    lines,
  };
};

jest.setTimeout(30_000);

describe('amounts on the page', () => {
  it('writes euros and cents the German way', () => {
    expect(formatAmount(129_000)).toBe('1.290,00');
    expect(formatAmount(9000)).toBe('90,00');
    expect(formatAmount(5)).toBe('0,05');
    expect(formatAmount(0)).toBe('0,00');
  });

  it('groups thousands, however many there are', () => {
    expect(formatAmount(100_000_000)).toBe('1.000.000,00');
    expect(formatAmount(123_456_789)).toBe('1.234.567,89');
  });

  it('keeps both decimals when the cents are a round number', () => {
    expect(formatAmount(129_010)).toBe('1.290,10');
    expect(formatAmount(129_001)).toBe('1.290,01');
  });

  it('handles a negative amount without losing the separator', () => {
    expect(formatAmount(-129_000)).toBe('-1.290,00');
  });
});

describe('quantities on the page', () => {
  it('drops the zeros nobody needs', () => {
    expect(formatQuantity(2.5)).toBe('2,5');
    expect(formatQuantity(1)).toBe('1');
  });

  it('keeps three decimals when they are there', () => {
    expect(formatQuantity(0.333)).toBe('0,333');
  });

  it('uses the German decimal comma', () => {
    expect(formatQuantity(1.75)).toContain(',');
    expect(formatQuantity(1.75)).not.toContain('.');
  });
});

describe('dates on the page', () => {
  it('turns an ISO date around', () => {
    expect(formatIsoDate('2026-09-03')).toBe('03.09.2026');
  });

  it('ignores a time if one comes with it', () => {
    expect(formatIsoDate('2026-12-24T10:30:00.000Z')).toBe('24.12.2026');
  });
});

describe('the columns this quote needs', () => {
  it('leaves out the discount column when nothing is discounted', () => {
    expect(
      columnsFor([line()], false).map((column) => column.key),
    ).not.toContain('discount');
  });

  it('adds the discount column as soon as one line has one', () => {
    expect(
      columnsFor([line(), line({ discountPercent: 10 })], false).map(
        (column) => column.key,
      ),
    ).toContain('discount');
  });

  it('leaves out the tax column when every line is taxed the same', () => {
    expect(
      columnsFor([line(), line()], false).map((column) => column.key),
    ).not.toContain('tax');
  });

  it('adds the tax column when the rates differ', () => {
    expect(
      columnsFor([line(), line({ taxRatePercent: 7 })], false).map(
        (column) => column.key,
      ),
    ).toContain('tax');
  });

  it('leaves out the tax column for a small business, whatever the lines say', () => {
    expect(
      columnsFor([line(), line({ taxRatePercent: 7 })], true).map(
        (column) => column.key,
      ),
    ).not.toContain('tax');
  });

  it('always fills the width exactly', () => {
    for (const lines of [
      [line()],
      [line({ discountPercent: 5 })],
      [line(), line({ taxRatePercent: 7 })],
      [line({ discountPercent: 5 }), line({ taxRatePercent: 0 })],
    ]) {
      const total = columnsFor(lines, false).reduce(
        (sum, column) => sum + column.width,
        0,
      );

      expect(total).toBeCloseTo(467.716, 1);
    }
  });

  it('gives the width the dropped columns held to the description', () => {
    const narrow = columnsFor([line({ discountPercent: 5 })], false);
    const wide = columnsFor([line()], false);
    const nameWidth = (columns: ReturnType<typeof columnsFor>) =>
      columns.find((column) => column.key === 'name')?.width ?? 0;

    expect(nameWidth(wide)).toBeGreaterThan(nameWidth(narrow));
  });
});

describe('the footer blocks', () => {
  it('is empty when there is no letterhead at all', () => {
    expect(footerColumns(null)).toEqual([]);
  });

  it('prints the IBAN in groups of four', () => {
    expect(footerColumns(letterhead)[2]).toContain(
      'DE89 3704 0044 0532 0130 00',
    );
  });

  it('leaves no blank lines in a block', () => {
    const blocks = footerColumns({
      ...letterhead,
      website: null,
      bic: null,
      country: null,
    });

    for (const block of blocks) {
      expect(block).not.toContain('');
      expect(block.every((entry) => entry.trim() !== '')).toBe(true);
    }
  });

  it('leaves out a line rather than printing a label with nothing after it', () => {
    const blocks = footerColumns({ ...letterhead, vatId: null, bic: null });

    expect(blocks[2].join(' ')).not.toContain('USt-IdNr.');
    expect(blocks[2].join(' ')).not.toContain('BIC');
    expect(blocks[2]).toContain('Steuernr. 22/815/00123');
  });
});

describe('the document itself', () => {
  it('is a PDF', async () => {
    const pdf = await renderQuotePdf(quote());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });

  it('carries the quote number as the subject', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('Angebot AN-2026-0001');
  });

  it('nennt, wer das Angebot bearbeitet, mit Funktion und Durchwahl', async () => {
    const text = textOf(
      await renderQuotePdf(
        quote({
          bearbeiter: {
            name: 'Anna Pruefer',
            funktion: 'Vertrieb Süd',
            durchwahl: '089 123-45',
            email: 'anna@example.de',
          },
        }),
      ),
    );

    expect(text).toContain('Ihr Ansprechpartner');
    expect(text).toContain('Anna Pruefer, Vertrieb Süd');
    expect(text).toContain('089 123-45');
    expect(textOf(await renderQuotePdf(quote()))).not.toContain(
      'Ihr Ansprechpartner',
    );
  });

  it('addresses it to the recipient on the quote', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('Südwind KG');
    expect(text).toContain('z. Hd. Frau Weber');
    expect(text).toContain('80331 München');
  });

  it('keeps the umlauts and the euro sign intact', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('Hafenstraße 12');
    expect(text).toContain('€');
  });

  it('prints the sender above the address, for the envelope window', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain(
      'Nordwind Logistik GmbH · Hafenstraße 12 · 20457 Hamburg',
    );
  });

  it('lists every line', async () => {
    const text = textOf(
      await renderQuotePdf(
        quote({
          lines: [
            line({ position: 0, name: 'Erstberatung' }),
            line({ position: 1, name: 'Systemeinrichtung' }),
            line({ position: 2, name: 'Schulung vor Ort' }),
          ],
        }),
      ),
    );

    expect(text).toContain('Erstberatung');
    expect(text).toContain('Systemeinrichtung');
    expect(text).toContain('Schulung vor Ort');
  });

  it('numbers the lines from one, not from zero', async () => {
    const text = textOf(
      await renderQuotePdf({
        ...quote({ lines: [line({ position: 0 }), line({ position: 1 })] }),
      }),
    );

    expect(text).toContain('Pos.');
    expect(text.split('\n')).toContain('1');
    expect(text.split('\n')).toContain('2');
    expect(text.split('\n')).not.toContain('0');
  });

  it('prints the article number and description under the name', async () => {
    const text = textOf(
      await renderQuotePdf(
        quote({
          lines: [
            line({
              articleNumber: 'B-100',
              description: 'inklusive Anfahrt',
            }),
          ],
        }),
      ),
    );

    expect(text).toContain('B-100 · inklusive Anfahrt');
  });

  it('adds up to the same figures the screen shows', async () => {
    const lines = [
      line({ quantity: 2.5, unitPriceCents: 9000, discountPercent: 10 }),
      line({
        position: 1,
        quantity: 2,
        unitPriceCents: 2500,
        taxRatePercent: 7,
      }),
    ];
    const text = textOf(await renderQuotePdf(quote({ lines })));

    expect(text).toContain('252,50 €');
    expect(text).toContain('294,48 €');
  });

  it('shows each tax rate on its own line, with what it was charged on', async () => {
    const lines = [
      line({ unitPriceCents: 20_250 }),
      line({ position: 1, unitPriceCents: 5000, taxRatePercent: 7 }),
    ];
    const text = textOf(await renderQuotePdf(quote({ lines })));

    expect(text).toContain('zzgl. 7 % USt. auf 50,00 €');
    expect(text).toContain('zzgl. 19 % USt. auf 202,50 €');
  });

  it('says when it stops being valid', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('Dieses Angebot ist gültig bis zum 03.10.2026.');
  });

  it('carries the intro and the closing sentence', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('vielen Dank für Ihre Anfrage');
    expect(text).toContain('Wir freuen uns auf Ihre Rückmeldung.');
  });

  it('says nothing about §19 for a company that charges VAT', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).not.toContain('§ 19 UStG');
  });

  it('says it plainly for a small business, which the law requires', async () => {
    const text = textOf(await renderQuotePdf(quote({ smallBusiness: true })));

    expect(text).toContain(
      'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    );
  });

  it('prints the details §35a requires, on the page', async () => {
    const text = textOf(await renderQuotePdf(quote()));

    expect(text).toContain('Amtsgericht Hamburg HRB 123456');
    expect(text).toContain('Vertretung: Anna Schmidt');
    expect(text).toContain('USt-IdNr. DE123456789');
    expect(text).toContain('DE89 3704 0044 0532 0130 00');
  });

  it('still produces a document when the letterhead has not been filled in', async () => {
    const pdf = await renderQuotePdf(quote({ letterhead: null }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(textOf(pdf)).toContain('Angebot AN-2026-0001');
  });

  it('handles a quote with no lines without falling over', async () => {
    const pdf = await renderQuotePdf(
      quote({ lines: [], totals: quoteTotals([]) }),
    );

    expect(textOf(pdf)).toContain('0,00 €');
  });
});

describe('a quote that runs past one page', () => {
  const many = Array.from({ length: 45 }, (_, index) =>
    line({ position: index, name: `Position Nummer ${String(index + 1)}` }),
  );

  it('starts a second page', async () => {
    expect(
      countPages(await renderQuotePdf(quote({ lines: many }))),
    ).toBeGreaterThan(1);
  });

  it('bricht auch eine einzelne, sehr lange Beschreibung über Seiten um', async () => {
    const absatz =
      'Lieferung, Montage und Inbetriebnahme einschließlich Prüfprotokoll. ';
    const lang = line({
      name: 'Großauftrag',
      description: `${absatz.repeat(120)}ENDE-DER-BESCHREIBUNG`,
    });
    const pdf = await renderQuotePdf(
      quote({ lines: [lang, line({ name: 'Danach' })] }),
    );
    const text = textOf(pdf);

    expect(countPages(pdf)).toBeGreaterThan(1);
    expect(text).toContain('ENDE-DER-BESCHREIBUNG');
    expect(text).toContain('Danach');
  });

  it('does not lose a line to the page break', async () => {
    const text = textOf(await renderQuotePdf(quote({ lines: many })));

    for (const entry of many) {
      expect(text).toContain(entry.name);
    }
  });

  it('repeats the column headings on the new page', async () => {
    const text = textOf(await renderQuotePdf(quote({ lines: many })));
    const headings = text
      .split('\n')
      .filter((piece) => piece === 'Bezeichnung');

    expect(headings.length).toBeGreaterThan(1);
  });

  it('numbers the pages, and only when there is more than one', async () => {
    const long = textOf(await renderQuotePdf(quote({ lines: many })));
    const short = textOf(await renderQuotePdf(quote()));

    expect(long).toContain('Seite 1 von ');
    expect(short).not.toContain('Seite 1 von ');
  });

  it('repeats the legal footer on every page', async () => {
    const text = textOf(await renderQuotePdf(quote({ lines: many })));
    const entries = text
      .split('\n')
      .filter((piece) => piece.includes('Amtsgericht Hamburg HRB 123456'));

    expect(entries.length).toBe(
      countPages(await renderQuotePdf(quote({ lines: many }))),
    );
  });

  it('keeps the total on the document, never orphaned off the end', async () => {
    const text = textOf(await renderQuotePdf(quote({ lines: many })));

    expect(text).toContain('Gesamtbetrag');
  });
});

const seitenText = (pdf: Buffer): string[] => {
  const seiten: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)endstream/gu;
  let match = streams.exec(pdf.toString('latin1'));

  while (match !== null) {
    const raw = Buffer.from(match[1], 'latin1');
    let content: string;

    try {
      content = inflateSync(raw).toString('latin1');
    } catch {
      content = raw.toString('latin1');
    }

    const stuecke = [...content.matchAll(/BT([\s\S]*?)ET/gu)]
      .map((block) =>
        [...block[1].matchAll(/<([0-9a-fA-F]*)>/gu)]
          .map((piece) => piece[1])
          .join(''),
      )
      .filter((hex) => hex !== '')
      .map((hex) => decodeWinAnsi(Buffer.from(hex, 'hex')));

    if (stuecke.length > 0) {
      seiten.push(stuecke.join('\n'));
    }

    match = streams.exec(pdf.toString('latin1'));
  }

  return seiten;
};

describe('eine Steuerbefreiung auf dem Papier', () => {
  const nullZeile = line({ name: 'Montage in Innsbruck', taxRatePercent: 0 });

  it('nennt den Grund und die USt-IdNr. des Empfängers', async () => {
    const text = textOf(
      await renderQuotePdf(
        quote({
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
            taxExemptionNote: null,
            recipientVatId: 'ATU12345678',
          },
        }),
      ),
    );

    expect(text).toContain('Steuerschuldnerschaft des Leistungsempfängers');
    expect(text).toContain('USt-IdNr. des Leistungsempfängers: ATU12345678');
    expect(text).toContain('0 % USt. – Reverse Charge');
    expect(text).not.toContain('zzgl. 0 %');
  });

  it('druckt beim Kleinunternehmer nur den Satz zu § 19', async () => {
    const text = textOf(
      await renderQuotePdf(
        quote({
          smallBusiness: true,
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.AUSFUHR,
            taxExemptionNote: null,
            recipientVatId: null,
          },
        }),
      ),
    );

    expect(text).toContain('§ 19 UStG');
    expect(text).not.toContain('Ausfuhr');
  });
});

describe('die Tabelle über mehrere Seiten', () => {
  const absatz =
    'Lieferung, Montage und Inbetriebnahme einschließlich Prüfprotokoll. ';

  it('wiederholt den Kopf auch dort, wo eine lange Beschreibung umbricht', async () => {
    const lang = line({
      name: 'Großauftrag',
      description: `${absatz.repeat(160)}ENDE-DER-BESCHREIBUNG`,
    });
    const pdf = await renderQuotePdf(
      quote({ lines: [lang, line({ name: 'Danach' })] }),
    );
    const seiten = seitenText(pdf);

    expect(seiten.length).toBe(countPages(pdf));
    expect(seiten.length).toBeGreaterThan(2);

    const bisLetzteZeile = seiten.slice(
      0,
      seiten.findIndex((seite) => seite.split('\n').includes('Danach')) + 1,
    );

    expect(bisLetzteZeile.length).toBeGreaterThan(2);

    for (const seite of bisLetzteZeile) {
      expect(seite.split('\n')).toContain('Bezeichnung');
    }

    expect(seiten.join('\n')).toContain('ENDE-DER-BESCHREIBUNG');
  });

  it('lässt nie einen Tabellenkopf ohne Zeile am Seitenende stehen', async () => {
    const zeilen = Array.from({ length: 3 }, (_, index) =>
      line({
        position: index,
        name: `Posten ${String(index + 1)}`,
        description: absatz.repeat(4),
      }),
    );

    for (let saetze = 0; saetze <= 60; saetze += 2) {
      const pdf = await renderQuotePdf(
        quote({ lines: zeilen, introText: absatz.repeat(saetze) }),
      );

      for (const seite of seitenText(pdf)) {
        if (seite.split('\n').includes('Bezeichnung')) {
          expect(seite).toMatch(/Posten \d/u);
        }
      }
    }
  });
});
