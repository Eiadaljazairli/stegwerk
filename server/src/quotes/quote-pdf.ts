import {
  type DocumentPdfInput,
  type PdfLetterhead,
  type PdfLine,
  renderDocumentPdf,
} from '../documents/document-pdf';
import { type QuoteTotals } from './quote-totals';
import { type Befreiungsfelder, pdfBefreiung } from './steuerbefreiung';

export {
  columnsFor,
  footerColumns,
  formatAmount,
  formatIsoDate,
  formatQuantity,
  type PdfLetterhead,
  type PdfLine,
} from '../documents/document-pdf';

export type QuotePdfInput = {
  number: string;
  issuedOn: string;
  validUntil: string;
  recipientAddress: string | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  befreiung?: Befreiungsfelder | null;
  contactName: string | null;
  bearbeiter?: {
    name: string;
    funktion: string | null;
    durchwahl: string | null;
    email: string;
  } | null;
  lines: PdfLine[];
  totals: QuoteTotals;
  letterhead: PdfLetterhead | null;
};

const isoToGerman = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');

  return `${day}.${month}.${year}`;
};

export const renderQuotePdf = (input: QuotePdfInput): Promise<Buffer> => {
  const generic: DocumentPdfInput = {
    documentLabel: 'Angebot',
    number: input.number,
    issuedOn: input.issuedOn,
    infoRows: [
      ['Angebotsnummer', input.number],
      ['Datum', isoToGerman(input.issuedOn)],
      ['Gültig bis', isoToGerman(input.validUntil)],
      ...(input.contactName === null
        ? []
        : ([['Ansprechpartner', input.contactName]] as [string, string][])),
      ...(input.bearbeiter == null
        ? []
        : ([
            [
              'Ihr Ansprechpartner',
              input.bearbeiter.funktion === null
                ? input.bearbeiter.name
                : `${input.bearbeiter.name}, ${input.bearbeiter.funktion}`,
            ],
            ...(input.bearbeiter.durchwahl === null
              ? []
              : [['Telefon', input.bearbeiter.durchwahl]]),
            ['E-Mail', input.bearbeiter.email],
          ] as [string, string][])),
    ],
    closingSentences: [
      `Dieses Angebot ist gültig bis zum ${isoToGerman(input.validUntil)}.`,
    ],
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
  };

  return renderDocumentPdf(generic);
};
