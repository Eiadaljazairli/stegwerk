import {
  type DocumentPdfInput,
  formatIsoDate,
  type PdfLetterhead,
  type PdfLine,
  renderDocumentPdf,
} from '../documents/document-pdf';
import { type QuoteTotals } from '../quotes/quote-totals';
import { giroCode } from './girocode';
import { CORRECTION_TITLE } from './invoice.types';
import { type Befreiungsfelder, pdfBefreiung } from '../quotes/steuerbefreiung';
import { type ERechnungAnhang } from '../documents/pdfa';

export type InvoicePdfInput = {
  number: string;
  issuedOn: string;
  serviceDate: string | null;
  dueOn: string | null;
  recipientAddress: string | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  befreiung?: Befreiungsfelder | null;
  contactName: string | null;
  correctsNumber: string | null;
  offen?: boolean;
  lines: PdfLine[];
  totals: QuoteTotals;
  letterhead: PdfLetterhead | null;
  eRechnung?: ERechnungAnhang | null;
};

export const closingSentencesFor = (input: InvoicePdfInput): string[] => {
  if (input.correctsNumber !== null) {
    return [
      `Diese Rechnungskorrektur nimmt die Rechnung ${input.correctsNumber} zurück.`,
      'Der ausgewiesene Betrag wird Ihnen erstattet.',
    ];
  }

  if (input.totals.grossCents === 0) {
    return ['Es ist kein Betrag zu zahlen.'];
  }

  const aufDasKonto =
    (input.letterhead?.iban ?? '') === ''
      ? ''
      : ' auf das unten genannte Konto';

  if (input.dueOn === null) {
    return [
      `Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer${aufDasKonto}.`,
    ];
  }

  return [
    `Bitte überweisen Sie den Betrag bis zum ${formatIsoDate(input.dueOn)} ohne Abzug unter Angabe der Rechnungsnummer${aufDasKonto}.`,
  ];
};

export const paymentQrFor = (
  input: InvoicePdfInput,
): { payload: string; caption: string } | null => {
  if (input.correctsNumber !== null || input.offen === false) {
    return null;
  }

  const payload = giroCode({
    name: input.letterhead?.companyName ?? null,
    iban: input.letterhead?.iban ?? null,
    bic: input.letterhead?.bic ?? null,
    amountCents: input.totals.grossCents,
    currency: 'EUR',
    reference: input.number,
  });

  if (payload === null) {
    return null;
  }

  return {
    payload,
    caption:
      'Bequem bezahlen: Code mit der Banking-App scannen. Empfänger, IBAN, Betrag und Rechnungsnummer sind dann schon ausgefüllt.',
  };
};

export const renderInvoicePdf = (input: InvoicePdfInput): Promise<Buffer> => {
  const generic: DocumentPdfInput = {
    documentLabel:
      input.correctsNumber === null ? 'Rechnung' : CORRECTION_TITLE,
    number: input.number,
    issuedOn: input.issuedOn,
    infoRows: [
      ['Rechnungsnummer', input.number],
      ['Rechnungsdatum', formatIsoDate(input.issuedOn)],
      ...(input.serviceDate === null
        ? []
        : ([['Leistungsdatum', formatIsoDate(input.serviceDate)]] as [
            string,
            string,
          ][])),
      ...(input.contactName === null
        ? []
        : ([['Ansprechpartner', input.contactName]] as [string, string][])),
    ],
    closingSentences: closingSentencesFor(input),
    paymentQr: paymentQrFor(input),
    recipientAddress: input.recipientAddress,
    introText: input.introText,
    closingText: input.closingText,
    smallBusiness: input.smallBusiness,
    steuerbefreiung:
      input.befreiung == null
        ? null
        : pdfBefreiung({
            ...input.befreiung,
            smallBusiness: input.smallBusiness,
          }),
    lines: input.lines,
    totals: input.totals,
    letterhead: input.letterhead,
    eRechnung: input.eRechnung ?? null,
  };

  return renderDocumentPdf(generic);
};
