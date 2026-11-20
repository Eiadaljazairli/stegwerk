import {
  closingSentencesFor,
  type InvoicePdfInput,
  paymentQrFor,
} from './invoice-pdf';

const briefkopf = {
  companyName: 'Nordwind Vertrieb GmbH',
  street: 'Hafenstraße 12',
  postalCode: '20359',
  city: 'Hamburg',
  country: 'Deutschland',
  phone: null,
  email: null,
  website: null,
  representative: null,
  registerEntry: null,
  taxNumber: '22/815/01234',
  vatId: null,
  bankName: null,
  iban: null,
  bic: null,
};

const rechnung = (over: Partial<InvoicePdfInput> = {}): InvoicePdfInput => ({
  number: 'RE-2026-0001',
  issuedOn: '2026-10-17',
  serviceDate: '2026-10-17',
  dueOn: '2026-10-31',
  recipientAddress: 'Alpenkraft AG\nAlpenweg 3\n83022 Rosenheim',
  introText: null,
  closingText: null,
  smallBusiness: false,
  contactName: null,
  correctsNumber: null,
  lines: [],
  totals: {
    netCents: 88500,
    taxCents: 16815,
    grossCents: 105315,
    taxGroups: [],
  },
  letterhead: briefkopf,
  ...over,
});

describe('der Hinweis auf die Zahlung', () => {
  it('nennt das Konto, wenn eines hinterlegt ist', () => {
    const satz = closingSentencesFor(
      rechnung({
        letterhead: { ...briefkopf, iban: 'DE02120300000000202051' },
      }),
    ).join(' ');

    expect(satz).toContain('auf das unten genannte Konto');
    expect(satz).toContain('bis zum 31.10.2026');
  });

  it('verweist auf kein Konto, wenn keines hinterlegt ist', () => {
    const satz = closingSentencesFor(rechnung()).join(' ');

    expect(satz).not.toContain('Konto');
    expect(satz).toContain('unter Angabe der Rechnungsnummer.');
    expect(satz).toContain('bis zum 31.10.2026');
  });

  it('behandelt eine leere IBAN wie gar keine', () => {
    const satz = closingSentencesFor(
      rechnung({ letterhead: { ...briefkopf, iban: '' } }),
    ).join(' ');

    expect(satz).not.toContain('Konto');
  });

  it('bleibt ohne Fälligkeit beim selben Verhalten', () => {
    const mit = closingSentencesFor(
      rechnung({
        dueOn: null,
        letterhead: { ...briefkopf, iban: 'DE02120300000000202051' },
      }),
    ).join(' ');
    const ohne = closingSentencesFor(rechnung({ dueOn: null })).join(' ');

    expect(mit).toContain('auf das unten genannte Konto');
    expect(mit).not.toContain('bis zum');
    expect(ohne).not.toContain('Konto');
  });

  it('fordert bei null Euro gar nichts an', () => {
    const satz = closingSentencesFor(
      rechnung({
        totals: { netCents: 0, taxCents: 0, grossCents: 0, taxGroups: [] },
      }),
    ).join(' ');

    expect(satz).toBe('Es ist kein Betrag zu zahlen.');
  });

  it('spricht bei einer Korrektur von Erstattung, nicht von Überweisung', () => {
    const satz = closingSentencesFor(
      rechnung({ correctsNumber: 'RE-2026-0001' }),
    ).join(' ');

    expect(satz).toContain('RE-2026-0001');
    expect(satz).toContain('erstattet');
    expect(satz).not.toContain('Gutschrift');
    expect(satz).not.toContain('Konto');
  });
});

describe('paymentQrFor', () => {
  const mitKonto = {
    ...briefkopf,
    iban: 'DE89 3704 0044 0532 0130 00',
    bic: 'COBADEFFXXX',
  };

  it('druckt einen GiroCode auf eine offene Rechnung mit Konto', () => {
    const qr = paymentQrFor(rechnung({ letterhead: mitKonto }));

    expect(qr?.payload.split('\n').slice(5, 8)).toEqual([
      'Nordwind Vertrieb GmbH',
      'DE89370400440532013000',
      'EUR1053.15',
    ]);
    expect(qr?.payload.endsWith('RE-2026-0001')).toBe(true);
  });

  it('druckt keinen ohne Konto im Briefkopf', () => {
    expect(paymentQrFor(rechnung())).toBeNull();
  });

  it('druckt keinen auf eine Korrektur, dort geht Geld zurück', () => {
    expect(
      paymentQrFor(
        rechnung({ letterhead: mitKonto, correctsNumber: 'RE-2026-0001' }),
      ),
    ).toBeNull();
  });

  it('druckt keinen, wenn nichts mehr offen ist', () => {
    expect(
      paymentQrFor(rechnung({ letterhead: mitKonto, offen: false })),
    ).toBeNull();
  });
});
