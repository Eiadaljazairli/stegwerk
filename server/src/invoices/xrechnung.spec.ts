import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { quoteTotals } from '../quotes/quote-totals';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';
import {
  betrag,
  einheitencode,
  empfaengerAusAnschrift,
  laenderkennung,
  renderXRechnung,
  type XRechnungInput,
  type XRechnungLine,
  xrechnungLuecken,
} from './xrechnung';

const ausgabe = process.env.XRECHNUNG_AUSGABE;

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

const lines: XRechnungLine[] = [
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
  const klein = overrides.smallBusiness ?? false;

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
    totals: quoteTotals(zeilen, klein),
  };
};

const behalte = (name: string, xml: string): string => {
  if (ausgabe !== undefined && ausgabe !== '') {
    writeFileSync(join(ausgabe, name), xml);
  }

  return xml;
};

describe('renderXRechnung', () => {
  it('schreibt eine Rechnung mit Kopf, Parteien, Steuer und Zeilen', () => {
    const xml = behalte('normal.xml', renderXRechnung(beispiel()));

    expect(xml).toContain(
      '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>',
    );
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain(
      '<cbc:EndpointID schemeID="EM">rechnung@stegwerk.test</cbc:EndpointID>',
    );
    expect(xml).toContain('<cbc:ID>DE89370400440532013000</cbc:ID>');
    expect(xml).toContain(
      '<cbc:BuyerReference>RE-2026-0001</cbc:BuyerReference>',
    );
    expect(xml).toContain('Vor Ort &amp; remote');
  });

  it('rechnet den Rabatt als Abschlag auf der Zeile', () => {
    const xml = renderXRechnung(beispiel());

    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="EUR">391.50</cbc:LineExtensionAmount>',
    );
    expect(xml).toContain('<cbc:Amount currencyID="EUR">43.50</cbc:Amount>');
    expect(xml).toContain(
      '<cbc:PriceAmount currencyID="EUR">145.00</cbc:PriceAmount>',
    );
  });

  it('weist je Steuersatz eine Gruppe aus, mit denselben Summen wie das PDF', () => {
    const eingabe = beispiel();
    const xml = renderXRechnung(eingabe);

    expect(
      eingabe.totals.taxGroups.map((gruppe) => gruppe.ratePercent),
    ).toEqual([7, 19]);
    expect(xml).toContain(
      `<cbc:PayableAmount currencyID="EUR">${betrag(eingabe.totals.grossCents)}</cbc:PayableAmount>`,
    );
    expect(xml.match(/<cac:TaxSubtotal>/gu)).toHaveLength(2);
  });

  it('schreibt eine Korrektur als 384 mit Verweis und negativen Beträgen', () => {
    const negativ = lines.map((line) => ({
      ...line,
      quantity: -line.quantity,
    }));
    const xml = behalte(
      'korrektur.xml',
      renderXRechnung(
        beispiel({
          number: 'RE-2026-0002',
          correctsNumber: 'RE-2026-0001',
          lines: negativ,
        }),
      ),
    );

    expect(xml).toContain('<cbc:InvoiceTypeCode>384</cbc:InvoiceTypeCode>');
    expect(xml).toContain(
      '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>RE-2026-0001</cbc:ID>',
    );
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="EUR">-391.50</cbc:LineExtensionAmount>',
    );
  });

  it('weist einen Kleinunternehmer mit Kategorie E und Begründung aus', () => {
    const xml = behalte(
      'kleinunternehmer.xml',
      renderXRechnung(
        beispiel({
          number: 'RE-2026-0003',
          smallBusiness: true,
          seller: { ...seller, vatId: null },
          notes: ['Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'],
        }),
      ),
    );

    expect(xml).toContain('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent>');
    expect(xml).toContain('Kleinunternehmer gemäß § 19 UStG');
    expect(xml).toContain('<cbc:ID>FC</cbc:ID>');
    expect(xml).not.toContain('<cbc:ID>S</cbc:ID>');
  });

  it('nimmt die Steuernummer als Kennung, wenn es sonst keine gibt', () => {
    const xml = behalte(
      'nur-steuernummer.xml',
      renderXRechnung(
        beispiel({
          number: 'RE-2026-0006',
          smallBusiness: true,
          seller: { ...seller, vatId: null, registerEntry: null },
        }),
      ),
    );

    expect(xml).toContain(
      '<cac:PartyIdentification><cbc:ID>27/123/45678</cbc:ID></cac:PartyIdentification>',
    );
  });

  it('nimmt Z für null Prozent bei jemandem, der sonst Steuer ausweist', () => {
    const zeilen = [{ ...lines[0], taxRatePercent: 0 }, lines[1]];
    const xml = behalte(
      'nullprozent.xml',
      renderXRechnung(beispiel({ number: 'RE-2026-0004', lines: zeilen })),
    );

    expect(xml).toContain('<cbc:ID>Z</cbc:ID><cbc:Percent>0</cbc:Percent>');
  });

  it('übernimmt die Käuferreferenz, wenn es eine gibt', () => {
    const xml = behalte(
      'leitweg.xml',
      renderXRechnung(
        beispiel({
          number: 'RE-2026-0005',
          buyerReference: '04011000-12345-67',
        }),
      ),
    );

    expect(xml).toContain(
      '<cbc:BuyerReference>04011000-12345-67</cbc:BuyerReference>',
    );
  });
});

describe('Steuerbefreiung', () => {
  const nullZeile: XRechnungLine = {
    position: 3,
    name: 'Wartungsvertrag',
    articleNumber: null,
    description: null,
    quantity: 1,
    unit: 'Pauschal',
    unitPriceCents: 50_000,
    discountPercent: 0,
    taxRatePercent: 0,
  };
  const ausland = {
    ...buyer,
    name: 'Bergwerk Innsbruck GmbH',
    street: 'Maria-Theresien-Straße 1',
    postalCode: '6020',
    city: 'Innsbruck',
    country: 'Österreich',
  };

  const nullGruppe = (xml: string): string => {
    const gruppen = xml.match(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/gu);
    const treffer = (gruppen ?? []).find((gruppe) =>
      gruppe.includes('<cbc:Percent>0</cbc:Percent>'),
    );

    if (treffer === undefined) {
      throw new Error('keine Gruppe mit 0 %');
    }

    return treffer;
  };

  it('schreibt Reverse Charge als AE mit Code, Grund und USt-IdNr. des Käufers', () => {
    const xml = behalte(
      'reverse-charge-eu.xml',
      renderXRechnung(
        beispiel({
          buyer: ausland,
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
            taxExemptionNote: null,
            recipientVatId: 'ATU 1234 5678',
          },
        }),
      ),
    );

    expect(nullGruppe(xml)).toMatch(
      /<cbc:ID>AE<\/cbc:ID><cbc:Percent>0<\/cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-AE<\/cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Steuerschuldnerschaft des Leistungsempfängers/u,
    );
    expect(xml).toMatch(
      /<cac:AccountingCustomerParty>[\s\S]*<\/cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>ATU12345678<\/cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT<\/cbc:ID><\/cac:TaxScheme><\/cac:PartyTaxScheme><cac:PartyLegalEntity>/u,
    );
    expect(xml).toContain(
      '<cac:ClassifiedTaxCategory><cbc:ID>AE</cbc:ID><cbc:Percent>0</cbc:Percent>',
    );
    expect(xml).toContain(
      '<cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>',
    );
  });

  it('trägt § 13b im Inland auch mit nur einer Steuernummer (BR-AE-02)', () => {
    const xml = behalte(
      'reverse-charge-inland.xml',
      renderXRechnung(
        beispiel({
          seller: { ...seller, vatId: null },
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.REVERSE_CHARGE,
            taxExemptionNote: null,
            recipientVatId: 'DE999999999',
          },
        }),
      ),
    );

    expect(nullGruppe(xml)).toContain('<cbc:ID>AE</cbc:ID>');
    expect(xml).toContain('(§ 13b UStG)');
  });

  it('schreibt die innergemeinschaftliche Lieferung als K mit Lieferland', () => {
    const xml = behalte(
      'innergemeinschaftlich.xml',
      renderXRechnung(
        beispiel({
          buyer: ausland,
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.INNERGEMEINSCHAFTLICH,
            taxExemptionNote: null,
            recipientVatId: 'ATU12345678',
          },
        }),
      ),
    );

    expect(nullGruppe(xml)).toContain(
      '<cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>',
    );
    expect(xml).toMatch(
      /<cac:Delivery><cbc:ActualDeliveryDate>2026-10-17<\/cbc:ActualDeliveryDate><cac:DeliveryLocation><cac:Address>[\s\S]*<cbc:IdentificationCode>AT<\/cbc:IdentificationCode>[\s\S]*<\/cac:DeliveryLocation><\/cac:Delivery>/u,
    );
  });

  it('schreibt die Ausfuhr als G', () => {
    const xml = behalte(
      'ausfuhr.xml',
      renderXRechnung(
        beispiel({
          lines: [nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.AUSFUHR,
            taxExemptionNote: null,
            recipientVatId: null,
          },
        }),
      ),
    );

    expect(nullGruppe(xml)).toContain(
      '<cbc:ID>G</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-G</cbc:TaxExemptionReasonCode>',
    );
    expect(xml).not.toContain('<cac:DeliveryLocation>');
  });

  it('schreibt einen sonstigen steuerfreien Umsatz als E mit der Rechtsgrundlage', () => {
    const xml = behalte(
      'steuerfrei.xml',
      renderXRechnung(
        beispiel({
          lines: [...lines, nullZeile],
          befreiung: {
            taxExemption: Steuerbefreiung.STEUERFREI,
            taxExemptionNote: '§ 4 Nr. 21 UStG',
            recipientVatId: null,
          },
        }),
      ),
    );

    expect(nullGruppe(xml)).toContain(
      '<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReason>Steuerfreier Umsatz: § 4 Nr. 21 UStG.</cbc:TaxExemptionReason>',
    );
    expect(xml).toContain('<cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent>');
  });

  it('lässt beim Nullsatz jeden Grund weg (BR-Z-10)', () => {
    const xml = renderXRechnung(
      beispiel({
        lines: [nullZeile],
        befreiung: {
          taxExemption: Steuerbefreiung.NULLSATZ,
          taxExemptionNote: null,
          recipientVatId: null,
        },
      }),
    );

    expect(nullGruppe(xml)).toContain(
      '<cbc:ID>Z</cbc:ID><cbc:Percent>0</cbc:Percent><cac:TaxScheme>',
    );
  });

  it('übergeht die Befreiung beim Kleinunternehmer, dort gilt § 19', () => {
    const xml = renderXRechnung(
      beispiel({
        smallBusiness: true,
        lines: [nullZeile],
        befreiung: {
          taxExemption: Steuerbefreiung.REVERSE_CHARGE,
          taxExemptionNote: null,
          recipientVatId: 'DE999999999',
        },
      }),
    );

    expect(xml).not.toContain('<cbc:ID>AE</cbc:ID>');
    expect(xml).not.toContain('DE999999999');
  });
});

describe('xrechnungLuecken', () => {
  it('ist leer, wenn alles da ist', () => {
    expect(xrechnungLuecken({ seller, buyer })).toEqual([]);
  });

  it('nennt, was im Briefkopf und beim Empfänger fehlt', () => {
    const luecken = xrechnungLuecken({
      seller: {
        ...seller,
        phone: null,
        iban: '',
        vatId: null,
        taxNumber: null,
      },
      buyer: { ...buyer, email: null },
    });

    expect(luecken).toEqual([
      { wo: 'Briefkopf', was: 'Telefon' },
      { wo: 'Briefkopf', was: 'USt-IdNr. oder Steuernummer' },
      { wo: 'Briefkopf', was: 'IBAN' },
      { wo: 'Firma', was: 'Rechnungs-E-Mail' },
    ]);
  });
});

describe('empfaengerAusAnschrift', () => {
  it('liest Name, Straße, PLZ und Ort nach DIN 5008', () => {
    expect(
      empfaengerAusAnschrift(
        'Alpenkraft Maschinenbau AG\nz. Hd. Einkauf\nAlpenweg 3\n83022 Rosenheim',
        null,
      ),
    ).toEqual({
      name: 'Alpenkraft Maschinenbau AG',
      street: 'Alpenweg 3',
      postalCode: '83022',
      city: 'Rosenheim',
      country: null,
    });
  });

  it('nimmt ein Land unter dem Ort mit', () => {
    expect(
      empfaengerAusAnschrift(
        'Wien Handel GmbH\nRing 1\n1010 Wien\nÖsterreich',
        null,
      ).country,
    ).toBe('Österreich');
  });

  it('fällt auf die Firma zurück, wenn sich das Feld nicht lesen lässt', () => {
    expect(
      empfaengerAusAnschrift('Nur ein Name', {
        name: 'Firma',
        street: 'Weg 1',
        postalCode: '12345',
        city: 'Stadt',
        country: 'DE',
      }),
    ).toEqual({
      name: 'Nur ein Name',
      street: 'Weg 1',
      postalCode: '12345',
      city: 'Stadt',
      country: 'DE',
    });
  });
});

describe('Hilfen', () => {
  it('formt Cent ohne Gleitkomma', () => {
    expect(betrag(0)).toBe('0.00');
    expect(betrag(5)).toBe('0.05');
    expect(betrag(-105315)).toBe('-1053.15');
  });

  it('übersetzt Länder und Einheiten', () => {
    expect(laenderkennung(null)).toBe('DE');
    expect(laenderkennung('Österreich')).toBe('AT');
    expect(laenderkennung('ch')).toBe('CH');
    expect(einheitencode('Stunde')).toBe('HUR');
    expect(einheitencode('Pauschal')).toBe('LS');
    expect(einheitencode('Palette')).toBe('C62');
  });
});
