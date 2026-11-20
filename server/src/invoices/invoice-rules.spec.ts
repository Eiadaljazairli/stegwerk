import {
  anschriftUnvollstaendig,
  invoiceGaps,
  type IssuerDetails,
  mayCancel,
  mayDelete,
  mayEdit,
  mayIssue,
  mayMarkPaid,
  statusAfterIssue,
} from './invoice-rules';
import { InvoiceStatus } from './invoice.types';

const ALLE = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAID,
  InvoiceStatus.CANCELLED,
];

describe('was der Zustand erlaubt', () => {
  it('lässt nur den Entwurf ändern', () => {
    expect(ALLE.filter((status) => mayEdit(status))).toEqual([
      InvoiceStatus.DRAFT,
    ]);
  });

  it('lässt nur den Entwurf stellen', () => {
    expect(ALLE.filter((status) => mayIssue(status))).toEqual([
      InvoiceStatus.DRAFT,
    ]);
  });

  it('lässt nur den Entwurf löschen', () => {
    expect(ALLE.filter((status) => mayDelete(status))).toEqual([
      InvoiceStatus.DRAFT,
    ]);
  });

  it('lässt Gestelltes und Bezahltes stornieren', () => {
    expect(ALLE.filter((status) => mayCancel(status, false))).toEqual([
      InvoiceStatus.ISSUED,
      InvoiceStatus.PAID,
    ]);
  });

  it('lässt eine Korrektur nicht selbst stornieren', () => {
    expect(mayCancel(InvoiceStatus.ISSUED, true)).toBe(false);
    expect(mayCancel(InvoiceStatus.PAID, true)).toBe(false);
  });

  it('lässt einen Entwurf nicht stornieren', () => {
    expect(mayCancel(InvoiceStatus.DRAFT, false)).toBe(false);
  });

  it('lässt nur Gestelltes als bezahlt buchen', () => {
    expect(ALLE.filter((status) => mayMarkPaid(status))).toEqual([
      InvoiceStatus.ISSUED,
    ]);
  });

  it('lässt eine stornierte Rechnung in Ruhe', () => {
    expect(mayEdit(InvoiceStatus.CANCELLED)).toBe(false);
    expect(mayIssue(InvoiceStatus.CANCELLED)).toBe(false);
    expect(mayCancel(InvoiceStatus.CANCELLED, false)).toBe(false);
    expect(mayMarkPaid(InvoiceStatus.CANCELLED)).toBe(false);
    expect(mayDelete(InvoiceStatus.CANCELLED)).toBe(false);
  });
});

describe('der Zustand nach dem Stellen', () => {
  it('ist offen, solange etwas zu zahlen ist', () => {
    expect(statusAfterIssue(1)).toBe(InvoiceStatus.ISSUED);
    expect(statusAfterIssue(1_732_212)).toBe(InvoiceStatus.ISSUED);
  });

  it('ist erledigt, wenn nichts zu zahlen ist', () => {
    expect(statusAfterIssue(0)).toBe(InvoiceStatus.PAID);
  });
});

describe('was §14 UStG noch fehlt', () => {
  const vollstaendig: IssuerDetails = {
    companyName: 'Vertrieb Demo GmbH',
    street: 'Werdauer Weg 35',
    postalCode: '10829',
    city: 'Berlin',
    taxNumber: '29/123/45678',
    vatId: 'DE123456789',
  };

  const rechnung = {
    recipientAddress: 'Nordwind Logistik GmbH\nKaiserkai 1\n20457 Hamburg',
    serviceDate: '2026-03-12',
    lineCount: 3,
  };

  it('meldet nichts, wenn alles da ist', () => {
    expect(invoiceGaps(vollstaendig, rechnung)).toEqual([]);
  });

  it('vermisst den eigenen Firmennamen', () => {
    expect(
      invoiceGaps({ ...vollstaendig, companyName: null }, rechnung).map(
        (gap) => gap.field,
      ),
    ).toEqual(['companyName']);
  });

  it('vermisst die eigene Anschrift, wenn ein Teil davon fehlt', () => {
    for (const feld of ['street', 'postalCode', 'city'] as const) {
      expect(
        invoiceGaps({ ...vollstaendig, [feld]: null }, rechnung).map(
          (gap) => gap.field,
        ),
      ).toEqual(['address']);
    }
  });

  it('lässt die Steuernummer durchgehen, wenn die USt-IdNr. da ist', () => {
    expect(invoiceGaps({ ...vollstaendig, taxNumber: null }, rechnung)).toEqual(
      [],
    );
    expect(invoiceGaps({ ...vollstaendig, vatId: null }, rechnung)).toEqual([]);
  });

  it('vermisst beide, wenn keine von beiden da ist', () => {
    expect(
      invoiceGaps(
        { ...vollstaendig, taxNumber: null, vatId: null },
        rechnung,
      ).map((gap) => gap.field),
    ).toEqual(['taxNumber']);
  });

  it('vermisst die Anschrift des Empfängers', () => {
    expect(
      invoiceGaps(vollstaendig, { ...rechnung, recipientAddress: null }).map(
        (gap) => gap.field,
      ),
    ).toEqual(['recipientAddress']);
  });

  it('vermisst eine Anschrift ohne Straße und PLZ', () => {
    expect(
      invoiceGaps(vollstaendig, {
        ...rechnung,
        recipientAddress: 'Nordwind Logistik GmbH\nHamburg\nDeutschland',
      }).map((gap) => gap.field),
    ).toEqual(['recipientAddress']);
  });

  it('vermisst das Leistungsdatum', () => {
    expect(
      invoiceGaps(vollstaendig, { ...rechnung, serviceDate: null }).map(
        (gap) => gap.field,
      ),
    ).toEqual(['serviceDate']);
  });

  it('vermisst eine Position', () => {
    expect(
      invoiceGaps(vollstaendig, { ...rechnung, lineCount: 0 }).map(
        (gap) => gap.field,
      ),
    ).toEqual(['lines']);
  });

  it('hält Leerzeichen nicht für einen Inhalt', () => {
    expect(
      invoiceGaps({ ...vollstaendig, companyName: '   ' }, rechnung).map(
        (gap) => gap.field,
      ),
    ).toEqual(['companyName']);
  });

  it('meldet alles auf einmal, statt nach dem ersten aufzuhören', () => {
    const leer: IssuerDetails = {
      companyName: null,
      street: null,
      postalCode: null,
      city: null,
      taxNumber: null,
      vatId: null,
    };

    expect(
      invoiceGaps(leer, {
        recipientAddress: null,
        serviceDate: null,
        lineCount: 0,
      }),
    ).toHaveLength(6);
  });
});

describe('eine vollständige Empfängeranschrift', () => {
  it.each([
    ['nur einem Namen', 'Nordwind Logistik GmbH'],
    ['Name und Ort', 'Nordwind Logistik GmbH\nHamburg'],
    ['Leerzeichen', '   '],
  ])('fehlt bei %s', (_fall, anschrift) => {
    expect(anschriftUnvollstaendig(anschrift)).toBe(true);
  });

  it.each([
    [
      'mit Straße und PLZ',
      'Nordwind Logistik GmbH\nKaiserkai 1\n20457 Hamburg',
    ],
    ['mit Postfach', 'Nordwind Logistik GmbH\nPostfach 11 22\n20457 Hamburg'],
    ['im Ausland', 'Acme Ltd\n10 Downing Street\nLondon SW1A 2AA'],
    [
      'mit Windows-Zeilenenden',
      'Nordwind GmbH\r\nKaiserkai 1\r\n20457 Hamburg',
    ],
  ])('genügt %s', (_fall, anschrift) => {
    expect(anschriftUnvollstaendig(anschrift)).toBe(false);
  });

  it('zählt eine Ziffer im Namen nicht als Anschrift', () => {
    expect(anschriftUnvollstaendig('Werk 3 GmbH\nHamburg')).toBe(true);
  });
});
