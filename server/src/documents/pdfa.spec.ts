import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { quoteTotals } from '../quotes/quote-totals';
import {
  renderInvoicePdf,
  type InvoicePdfInput,
} from '../invoices/invoice-pdf';
import { renderFacturX } from '../invoices/zugferd';
import { istCmykJpeg } from './pdfa';

const ausgabe = process.env.ZUGFERD_AUSGABE;

const PNG_MIT_ALPHA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const zeilen = [
  {
    position: 1,
    name: 'Beratungstag',
    articleNumber: 'B-1',
    description: 'Vor Ort',
    quantity: 3,
    unit: 'Stunde',
    unitPriceCents: 14500,
    discountPercent: 10,
    taxRatePercent: 19,
  },
];

const briefkopf = {
  companyName: 'Müller & Söhne GmbH',
  street: 'Hafenstraße 12',
  postalCode: '20359',
  city: 'Hamburg',
  country: 'Deutschland',
  phone: '040 123456',
  email: 'rechnung@mueller.test',
  website: null,
  representative: 'Anna Müller',
  registerEntry: 'HRB 1234',
  taxNumber: '22/815/01234',
  vatId: 'DE123456789',
  bankName: 'Hamburger Sparkasse',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
};

const totals = quoteTotals(zeilen, false);

const xml = renderFacturX({
  number: 'RE-2026-0001',
  issuedOn: '2026-10-17',
  dueOn: '2026-10-31',
  serviceDate: '2026-10-17',
  buyerReference: null,
  correctsNumber: null,
  smallBusiness: false,
  currency: 'EUR',
  notes: [],
  seller: {
    name: briefkopf.companyName,
    street: briefkopf.street,
    postalCode: briefkopf.postalCode,
    city: briefkopf.city,
    country: briefkopf.country,
    email: briefkopf.email,
    phone: briefkopf.phone,
    contactName: briefkopf.representative,
    vatId: briefkopf.vatId,
    taxNumber: briefkopf.taxNumber,
    registerEntry: briefkopf.registerEntry,
    iban: briefkopf.iban,
    bic: briefkopf.bic,
    bankName: briefkopf.bankName,
  },
  buyer: {
    name: 'Alpenkraft AG',
    street: 'Alpenweg 3',
    postalCode: '83022',
    city: 'Rosenheim',
    country: null,
    email: null,
  },
  lines: zeilen,
  totals,
});

const rechnung = (over: Partial<InvoicePdfInput> = {}): InvoicePdfInput => ({
  number: 'RE-2026-0001',
  issuedOn: '2026-10-17',
  serviceDate: '2026-10-17',
  dueOn: '2026-10-31',
  recipientAddress: 'Alpenkraft AG\nAlpenweg 3\n83022 Rosenheim',
  introText: 'Für unsere Leistungen berechnen wir „wie besprochen“:',
  closingText: null,
  smallBusiness: false,
  contactName: null,
  correctsNumber: null,
  offen: true,
  lines: zeilen,
  totals,
  letterhead: briefkopf,
  ...over,
});

const mitERechnung = () =>
  renderInvoicePdf(
    rechnung({
      eRechnung: { xml, dateiname: 'factur-x.xml', profil: 'EN 16931' },
    }),
  );

const stroeme = (pdf: Buffer): string[] => {
  const text = pdf.toString('latin1');
  const treffer = [...text.matchAll(/stream\r?\n([\s\S]*?)endstream/gu)];

  return treffer.map((teil) => {
    const roh = Buffer.from(teil[1], 'latin1');

    try {
      return inflateSync(roh).toString('utf8');
    } catch {
      return roh.toString('utf8');
    }
  });
};

describe('PDF mit eingebetteter E-Rechnung', () => {
  it('ist PDF 1.7 mit PDF/A-3b im XMP', async () => {
    const pdf = await mitERechnung();
    const text = pdf.toString('latin1');

    if (ausgabe !== undefined && ausgabe !== '') {
      writeFileSync(join(ausgabe, 'zugferd.pdf'), pdf);
    }

    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(text).toContain('/OutputIntents');
    expect(text).toContain('/GTS_PDFA1');

    const xmp = stroeme(pdf).find((strom) => strom.includes('x:xmpmeta'));

    expect(xmp).toBeDefined();
    expect(xmp).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(xmp).toContain(
      '<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>',
    );
    expect(xmp).toContain(
      '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
    );
    expect(xmp).toContain('Factur-X PDFA Extension Schema');
    expect(xmp).toContain('Müller &amp; Söhne GmbH');
    expect(xmp).not.toContain('Müller & Söhne');
  });

  it('bettet die XML als Alternative ein und verweist aus dem Katalog darauf', async () => {
    const pdf = await mitERechnung();
    const text = pdf.toString('latin1');

    expect(text).toContain('/AFRelationship /Alternative');
    expect(text).toMatch(/\/AF \[\d+ 0 R\]/u);
    expect(text).toContain('/Subtype /text#2Fxml');
    expect(text).toContain('/EmbeddedFiles');
    expect(text).toContain('(factur-x.xml)');
    expect(stroeme(pdf)).toContain(xml);
  });

  it('bettet die Schriften ein statt der eingebauten Helvetica', async () => {
    const text = (await mitERechnung()).toString('latin1');

    expect(text).toContain('/FontFile2');
    expect(text).toContain('LiberationSans');
    expect(text).not.toMatch(/\/BaseFont \/Helvetica\b/u);
  });

  it('schreibt kein CIDSet, das nicht zur Teilschrift passt', async () => {
    expect((await mitERechnung()).toString('latin1')).not.toContain('/CIDSet');
  });

  it('nimmt Logo mit Transparenz und Folgeseiten mit', async () => {
    const viele = Array.from({ length: 45 }, (_, index) => ({
      ...zeilen[0],
      position: index + 1,
      name: `Position ${String(index + 1)} mit „Anführungszeichen“ & Umlauten äöü ß €`,
    }));
    const pdf = await renderInvoicePdf(
      rechnung({
        lines: viele,
        totals: quoteTotals(viele, false),
        letterhead: { ...briefkopf, logo: PNG_MIT_ALPHA },
        eRechnung: { xml, dateiname: 'factur-x.xml', profil: 'EN 16931' },
      }),
    );
    const text = pdf.toString('latin1');

    if (ausgabe !== undefined && ausgabe !== '') {
      writeFileSync(join(ausgabe, 'zugferd-logo-mehrseitig.pdf'), pdf);
    }

    expect(text).toContain('/SMask');
    expect(Number(/\/Count (\d+)/u.exec(text)?.[1])).toBeGreaterThan(1);
  });

  it('bleibt ohne E-Rechnung das gewöhnliche PDF', async () => {
    const text = (await renderInvoicePdf(rechnung())).toString('latin1');

    expect(text.startsWith('%PDF-1.3')).toBe(true);
    expect(text).not.toContain('/AFRelationship');
    expect(text).not.toContain('/FontFile2');
  });
});

describe('istCmykJpeg', () => {
  const jpeg = (kanaele: number, marke = 0xc0): Buffer =>
    Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00,
      0xff,
      marke,
      0x00,
      0x11,
      0x08,
      0x00,
      0x10,
      0x00,
      0x10,
      kanaele,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x00,
      0x03,
      0x11,
      0x00,
      0x04,
      0x11,
      0x00,
    ]);

  it('erkennt vier Kanäle als CMYK', () => {
    expect(istCmykJpeg(jpeg(4))).toBe(true);
    expect(istCmykJpeg(jpeg(4, 0xc2))).toBe(true);
  });

  it('lässt RGB, Graustufen und PNG durch', () => {
    expect(istCmykJpeg(jpeg(3))).toBe(false);
    expect(istCmykJpeg(jpeg(1))).toBe(false);
    expect(
      istCmykJpeg(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')),
    ).toBe(false);
    expect(istCmykJpeg(Buffer.alloc(0))).toBe(false);
  });
});
