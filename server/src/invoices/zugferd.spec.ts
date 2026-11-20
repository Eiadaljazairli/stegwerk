import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { quoteTotals } from '../quotes/quote-totals';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';
import { XRECHNUNG_CUSTOMIZATION, type XRechnungInput } from './xrechnung';
import { FACTURX_EN16931, renderFacturX, zugferdLuecken } from './zugferd';

const ausgabe = process.env.ZUGFERD_AUSGABE;

const seller = {
  name: 'Stegwerk Test GmbH',
  street: 'Hauptstraße 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Deutschland',
  email: 'rechnung@stegwerk.test',
  phone: '+49 30 123456',
  contactName: 'Anna Pruefer',
  vatId: 'DE123456789',
  taxNumber: '27/123/45678',
  registerEntry: 'HRB 12345 B',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
};

const buyer = {
  name: 'Alpenkraft Maschinenbau AG',
  street: 'Alpenweg 3',
  postalCode: '83022',
  city: 'Rosenheim',
  country: null,
  email: 'einkauf@alpenkraft.de',
};

const lines: XRechnungInput['lines'] = [
  {
    position: 1,
    name: 'Beratungstag',
    articleNumber: 'B-1',
    description: 'Vor Ort & remote',
    quantity: 3,
    unit: 'Stunde',
    unitPriceCents: 14500,
    discountPercent: 10,
    taxRatePercent: 19,
  },
  {
    position: 2,
    name: 'Fachbuch',
    articleNumber: null,
    description: null,
    quantity: 2.5,
    unit: 'Stück',
    unitPriceCents: 3999,
    discountPercent: 0,
    taxRatePercent: 7,
  },
];

const beispiel = (overrides: Partial<XRechnungInput> = {}): XRechnungInput => {
  const zeilen = overrides.lines ?? lines;

  return {
    number: 'RE-2026-0001',
    issuedOn: '2026-10-17',
    dueOn: '2026-10-31',
    serviceDate: '2026-10-17',
    buyerReference: null,
    correctsNumber: null,
    smallBusiness: false,
    currency: 'EUR',
    notes: ['Vielen Dank für Ihren Auftrag.'],
    seller,
    buyer,
    ...overrides,
    lines: zeilen,
    totals: quoteTotals(zeilen, overrides.smallBusiness ?? false),
  };
};

const behalte = (name: string, eingabe: XRechnungInput): string => {
  const xml = renderFacturX(eingabe);

  if (ausgabe !== undefined && ausgabe !== '') {
    writeFileSync(join(ausgabe, `${name}.xml`), xml);
    writeFileSync(
      join(ausgabe, `${name}-xr.xml`),
      renderFacturX(eingabe, XRECHNUNG_CUSTOMIZATION),
    );
  }

  return xml;
};

const nullProzent = lines.map((line) => ({ ...line, taxRatePercent: 0 }));

const befreit = (
  taxExemption: Steuerbefreiung,
  extra: Partial<XRechnungInput> = {},
): XRechnungInput =>
  beispiel({
    lines: nullProzent,
    befreiung: {
      taxExemption,
      taxExemptionNote:
        taxExemption === Steuerbefreiung.STEUERFREI
          ? '§ 4 Nr. 14 UStG (Heilbehandlung)'
          : null,
      recipientVatId:
        taxExemption === Steuerbefreiung.REVERSE_CHARGE ||
        taxExemption === Steuerbefreiung.REVERSE_CHARGE_EU ||
        taxExemption === Steuerbefreiung.INNERGEMEINSCHAFTLICH
          ? 'ATU12345678'
          : null,
    },
    ...extra,
  });

describe('renderFacturX', () => {
  it('schreibt das Profil EN 16931 in CII', () => {
    const xml = behalte('normal', beispiel());

    expect(xml).toContain('<rsm:CrossIndustryInvoice');
    expect(xml).toContain(
      `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${FACTURX_EN16931}</ram:ID>`,
    );
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(xml).toContain(
      '<udt:DateTimeString format="102">20261017</udt:DateTimeString>',
    );
    expect(xml).toContain('<ram:IBANID>DE89370400440532013000</ram:IBANID>');
    expect(xml).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');
    expect(xml).toContain('<ram:ID schemeID="FC">27/123/45678</ram:ID>');
    expect(xml).toContain('Vor Ort &amp; remote');
  });

  it('stellt die Positionen vor den Kopf, wie das Schema es will', () => {
    const xml = renderFacturX(beispiel());

    expect(xml.indexOf('<ram:IncludedSupplyChainTradeLineItem>')).toBeLessThan(
      xml.indexOf('<ram:ApplicableHeaderTradeAgreement>'),
    );
    expect(xml.indexOf('<ram:ApplicableHeaderTradeAgreement>')).toBeLessThan(
      xml.indexOf('<ram:ApplicableHeaderTradeDelivery>'),
    );
    expect(xml.indexOf('<ram:ApplicableHeaderTradeDelivery>')).toBeLessThan(
      xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'),
    );
  });

  it('rechnet Rabatt und Summen wie PDF und XRechnung', () => {
    const eingabe = beispiel();
    const xml = renderFacturX(eingabe);

    expect(xml).toContain('<ram:LineTotalAmount>391.50</ram:LineTotalAmount>');
    expect(xml).toContain('<ram:ActualAmount>43.50</ram:ActualAmount>');
    expect(xml).toContain('<ram:ChargeAmount>145.00</ram:ChargeAmount>');
    expect(xml).toContain(
      `<ram:GrandTotalAmount>${(eingabe.totals.grossCents / 100).toFixed(2)}</ram:GrandTotalAmount>`,
    );
    expect(xml).toContain(
      `<ram:TaxTotalAmount currencyID="EUR">${(eingabe.totals.taxCents / 100).toFixed(2)}</ram:TaxTotalAmount>`,
    );
  });

  it('schreibt eine Korrektur als 384 mit Verweis und negativen Beträgen', () => {
    const negativ = lines.map((line) => ({
      ...line,
      quantity: -line.quantity,
    }));
    const xml = behalte(
      'korrektur',
      beispiel({
        number: 'RE-2026-0002',
        correctsNumber: 'RE-2026-0001',
        lines: negativ,
      }),
    );

    expect(xml).toContain('<ram:TypeCode>384</ram:TypeCode>');
    expect(xml).toContain(
      '<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>RE-2026-0001</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>',
    );
    expect(xml).toContain('<ram:LineTotalAmount>-391.50</ram:LineTotalAmount>');
  });

  it('weist den Kleinunternehmer mit E und Begründung aus', () => {
    const xml = behalte(
      'kleinunternehmer',
      beispiel({
        number: 'RE-2026-0003',
        smallBusiness: true,
        seller: { ...seller, vatId: null },
      }),
    );

    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
    expect(xml).toContain('Kleinunternehmer gemäß § 19 UStG');
    expect(xml).not.toContain('schemeID="VA"');
  });

  it('nimmt die Steuernummer als Kennung, wenn es nichts anderes gibt', () => {
    const xml = behalte(
      'nur-steuernummer',
      beispiel({
        number: 'RE-2026-0004',
        seller: { ...seller, vatId: null, registerEntry: null },
      }),
    );

    expect(xml).toContain(
      '<ram:SellerTradeParty><ram:ID>27/123/45678</ram:ID>',
    );
  });

  it.each([
    [Steuerbefreiung.REVERSE_CHARGE, 'AE', 'VATEX-EU-AE'],
    [Steuerbefreiung.REVERSE_CHARGE_EU, 'AE', 'VATEX-EU-AE'],
    [Steuerbefreiung.INNERGEMEINSCHAFTLICH, 'K', 'VATEX-EU-IC'],
    [Steuerbefreiung.AUSFUHR, 'G', 'VATEX-EU-G'],
    [Steuerbefreiung.STEUERFREI, 'E', null],
    [Steuerbefreiung.NULLSATZ, 'Z', null],
  ])('weist %s als %s aus', (grund, kategorie, code) => {
    const xml = behalte(`befreiung-${grund.toLowerCase()}`, befreit(grund));

    expect(xml).toContain(`<ram:CategoryCode>${kategorie}</ram:CategoryCode>`);

    if (code === null) {
      expect(xml).not.toContain('<ram:ExemptionReasonCode>');
    } else {
      expect(xml).toContain(
        `<ram:ExemptionReasonCode>${code}</ram:ExemptionReasonCode>`,
      );
    }

    if (kategorie === 'Z') {
      expect(xml).not.toContain('<ram:ExemptionReason>');
    }
  });

  it('nennt bei innergemeinschaftlicher Lieferung Lieferland und USt-IdNr.', () => {
    const xml = renderFacturX(befreit(Steuerbefreiung.INNERGEMEINSCHAFTLICH));

    expect(xml).toContain('<ram:ShipToTradeParty>');
    expect(xml).toContain('<ram:ID schemeID="VA">ATU12345678</ram:ID>');
  });

  it('kommt ohne Bankverbindung, E-Mail und Telefon aus', () => {
    const xml = behalte(
      'knapp',
      beispiel({
        number: 'RE-2026-0005',
        seller: {
          ...seller,
          email: null,
          phone: null,
          contactName: null,
          iban: null,
          bic: null,
        },
        buyer: { ...buyer, email: null },
      }),
    );

    expect(xml).not.toContain('<ram:SpecifiedTradeSettlementPaymentMeans>');
    expect(xml).not.toContain('<ram:DefinedTradeContact>');
    expect(xml).not.toContain('schemeID="EM"');
  });

  it('lässt verbotene Steuerzeichen aus dem Text', () => {
    const xml = renderFacturX(beispiel({ notes: ['Zeile\u0007mit Klingel'] }));

    expect(xml).toContain('Zeilemit Klingel');
  });
});

describe('zugferdLuecken', () => {
  it('verlangt weniger als die XRechnung', () => {
    expect(
      zugferdLuecken({
        seller: { ...seller, email: null, phone: null, iban: null },
        buyer: { ...buyer, email: null, postalCode: null, city: null },
      }),
    ).toEqual([]);
  });

  it('meldet Verkäufername, Steuerangabe und Käufername', () => {
    expect(
      zugferdLuecken({
        seller: { ...seller, name: ' ', vatId: null, taxNumber: '' },
        buyer: { ...buyer, name: null },
      }).map((luecke) => luecke.was),
    ).toEqual(['Firmenname', 'USt-IdNr. oder Steuernummer', 'Name']);
  });
});
