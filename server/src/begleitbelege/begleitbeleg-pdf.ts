import {
  type DocumentPdfInput,
  formatIsoDate,
  type PdfLetterhead,
  type PdfLine,
  renderDocumentPdf,
} from '../documents/document-pdf';
import { quoteTotals } from '../quotes/quote-totals';
import { type Befreiungsfelder, pdfBefreiung } from '../quotes/steuerbefreiung';
import { ART_TEXT, BegleitbelegArt } from './begleitbeleg.types';

export type BegleitbelegPdfInput = {
  art: BegleitbelegArt;
  number: string;
  issuedOn: string;
  angebot: { number: string; issuedOn: string };
  auftragsbestaetigung?: { number: string; issuedOn: string } | null;
  storno?: {
    number: string;
    issuedOn: string;
    grund: string | null;
  } | null;
  recipientAddress: string | null;
  lieferadresse: string | null;
  liefertermin: string | null;
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
  letterhead: PdfLetterhead | null;
};

export const standardEinleitung = (
  input: Pick<BegleitbelegPdfInput, 'art' | 'angebot'> &
    Partial<Pick<BegleitbelegPdfInput, 'auftragsbestaetigung' | 'storno'>>,
): string => {
  const angebot = `${input.angebot.number} vom ${formatIsoDate(input.angebot.issuedOn)}`;

  if (input.storno != null) {
    const lieferschein = input.art === BegleitbelegArt.LIEFERSCHEIN;
    const welcher = lieferschein
      ? 'den Lieferschein'
      : 'die Auftragsbestätigung';

    return `Hiermit stornieren wir ${welcher} ${input.storno.number} vom ${formatIsoDate(input.storno.issuedOn)}. ${lieferschein ? 'Er' : 'Sie'} ist damit gegenstandslos.`;
  }

  if (input.art === BegleitbelegArt.AUFTRAGSBESTAETIGUNG) {
    return `Vielen Dank für Ihren Auftrag. Wir bestätigen Ihren Auftrag zu unserem Angebot ${angebot} wie folgt:`;
  }

  return input.auftragsbestaetigung == null
    ? `Wir liefern zu unserem Angebot ${angebot}:`
    : `Wir liefern zu unserer Auftragsbestätigung ${input.auftragsbestaetigung.number} vom ${formatIsoDate(input.auftragsbestaetigung.issuedOn)}:`;
};

const ansprechpartner = (input: BegleitbelegPdfInput): [string, string][] =>
  input.bearbeiter == null
    ? []
    : [
        [
          'Ihr Ansprechpartner',
          input.bearbeiter.funktion === null
            ? input.bearbeiter.name
            : `${input.bearbeiter.name}, ${input.bearbeiter.funktion}`,
        ],
        ...(input.bearbeiter.durchwahl === null
          ? []
          : ([['Telefon', input.bearbeiter.durchwahl]] as [string, string][])),
        ['E-Mail', input.bearbeiter.email],
      ];

export const renderBegleitbelegPdf = (
  input: BegleitbelegPdfInput,
): Promise<Buffer> => {
  const lieferschein = input.art === BegleitbelegArt.LIEFERSCHEIN;
  const storno = input.storno != null;
  const label = storno
    ? `Stornierung ${lieferschein ? 'Lieferschein' : 'Auftragsbestätigung'}`
    : ART_TEXT[input.art].label;

  const infoRows: [string, string][] = [
    [
      storno
        ? 'Stornonummer'
        : lieferschein
          ? 'Lieferscheinnummer'
          : 'Bestätigungsnummer',
      input.number,
    ],
    ['Datum', formatIsoDate(input.issuedOn)],
    ...(storno && input.storno != null
      ? ([['Storniert', input.storno.number]] as [string, string][])
      : []),
    ['Ihr Angebot', input.angebot.number],
    ...(input.auftragsbestaetigung == null
      ? []
      : ([['Auftragsbestätigung', input.auftragsbestaetigung.number]] as [
          string,
          string,
        ][])),
    ...(input.liefertermin === null || storno
      ? []
      : ([
          [
            lieferschein ? 'Lieferdatum' : 'Liefertermin',
            formatIsoDate(input.liefertermin),
          ],
        ] as [string, string][])),
    ...(input.contactName === null
      ? []
      : ([['Ansprechpartner', input.contactName]] as [string, string][])),
    ...ansprechpartner(input),
  ];

  const imFenster =
    lieferschein && input.lieferadresse !== null && input.lieferadresse !== ''
      ? input.lieferadresse
      : input.recipientAddress;

  const closingSentences: string[] = [];

  if (storno && input.storno?.grund) {
    closingSentences.push(`Grund: ${input.storno.grund}`);
  }

  if (!storno && !lieferschein && input.liefertermin !== null) {
    closingSentences.push(
      `Als Liefertermin bestätigen wir den ${formatIsoDate(input.liefertermin)}.`,
    );
  }

  if (
    lieferschein &&
    !storno &&
    input.lieferadresse !== null &&
    input.lieferadresse !== '' &&
    input.recipientAddress !== null
  ) {
    closingSentences.push(
      `Rechnungsanschrift: ${input.recipientAddress.replace(/\n/gu, ', ')}`,
    );
  }

  if (lieferschein && input.lines.some((line) => (line.offen ?? 0) > 0)) {
    closingSentences.push(
      'Dies ist eine Teillieferung. Die noch offenen Mengen liefern wir nach.',
    );
  }

  const generic: DocumentPdfInput = {
    documentLabel: label,
    number: input.number,
    issuedOn: input.issuedOn,
    infoRows,
    closingSentences,
    recipientAddress: imFenster,
    introText:
      input.introText !== null && input.introText.trim() !== ''
        ? input.introText
        : standardEinleitung(input),
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
    totals: quoteTotals(input.lines, input.smallBusiness),
    letterhead: input.letterhead,
    ohnePreise: lieferschein,
    unterschrift:
      lieferschein && !storno
        ? {
            satz: 'Ware vollständig und in einwandfreiem Zustand erhalten:',
          }
        : null,
  };

  return renderDocumentPdf(generic);
};
