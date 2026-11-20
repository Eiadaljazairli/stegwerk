import PDFDocument from 'pdfkit';
import qrcode from 'qrcode-generator';

import { formatIban } from '../quotes/letterhead-checks';
import { lineNetCents, type QuoteTotals } from '../quotes/quote-totals';
import {
  type ERechnungAnhang,
  eRechnungAnhaengen,
  PDFA_OPTIONEN,
  schriftenEinbetten,
} from './pdfa';

const MM = 2.834_645_669;
const mm = (value: number): number => value * MM;

const LEFT = mm(25);
const RIGHT = mm(20);
const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const ADDRESS_TOP = mm(45);
const INFO_LEFT = mm(125);
const SUBJECT_TOP = mm(98.46);
const FOOTER_TOP = mm(272);
const BOTTOM_LIMIT = mm(268);

const FOLD_UPPER = mm(105);
const PUNCH = mm(148.5);
const FOLD_LOWER = mm(210);

export const formatAmount = (cents: number): string => {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = String(Math.floor(absolute / 100));
  const fraction = String(absolute % 100).padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');

  return `${negative ? '-' : ''}${grouped},${fraction}`;
};

export const formatQuantity = (quantity: number): string => {
  const rounded = Math.round(quantity * 1000) / 1000;

  return String(rounded).replace('.', ',');
};

export const formatIsoDate = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');

  return `${day}.${month}.${year}`;
};

export type PdfLine = {
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
  offen?: number | null;
};

export type PdfLetterhead = {
  companyName: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  representative: string | null;
  registerEntry: string | null;
  taxNumber: string | null;
  vatId: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  logo?: Buffer | null;
};

const LOGO_TOP = mm(12);
const LOGO_WIDTH = mm(45);
const LOGO_HEIGHT = mm(22);

export type DocumentPdfInput = {
  documentLabel: string;
  number: string;
  issuedOn: string;
  infoRows: [string, string][];
  closingSentences: string[];
  paymentQr?: { payload: string; caption: string } | null;
  recipientAddress: string | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  steuerbefreiung?: { kurz: string; hinweise: string[] } | null;
  lines: PdfLine[];
  totals: QuoteTotals;
  letterhead: PdfLetterhead | null;
  eRechnung?: ERechnungAnhang | null;
  ohnePreise?: boolean;
  unterschrift?: { satz: string } | null;
};

type Column = {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right';
};

export const columnsFor = (
  lines: PdfLine[],
  smallBusiness: boolean,
  ohnePreise = false,
): Column[] => {
  if (ohnePreise) {
    const anyOffen = lines.some((line) => (line.offen ?? 0) > 0);
    const rechts: Column[] = [
      { key: 'quantity', label: 'Menge', width: mm(20), align: 'right' },
      { key: 'unit', label: 'Einheit', width: mm(18), align: 'left' },
      ...(anyOffen
        ? [
            {
              key: 'offen',
              label: 'Noch offen',
              width: mm(22),
              align: 'right' as const,
            },
          ]
        : []),
    ];
    const position: Column = {
      key: 'position',
      label: 'Pos.',
      width: mm(8),
      align: 'left',
    };
    const belegt = [position, ...rechts].reduce(
      (sum, column) => sum + column.width,
      0,
    );

    return [
      position,
      {
        key: 'name',
        label: 'Bezeichnung',
        width: CONTENT_WIDTH - belegt,
        align: 'left',
      },
      ...rechts,
    ];
  }

  const anyDiscount = lines.some((line) => line.discountPercent > 0);
  const rates = new Set(lines.map((line) => line.taxRatePercent));
  const showTax = !smallBusiness && rates.size > 1;

  const fixed: Column[] = [
    { key: 'position', label: 'Pos.', width: mm(8), align: 'left' },
    { key: 'quantity', label: 'Menge', width: mm(16), align: 'right' },
    { key: 'unit', label: 'Einheit', width: mm(16), align: 'left' },
    { key: 'unitPrice', label: 'Einzelpreis', width: mm(24), align: 'right' },
    ...(anyDiscount
      ? [
          {
            key: 'discount',
            label: 'Rabatt',
            width: mm(14),
            align: 'right' as const,
          },
        ]
      : []),
    ...(showTax
      ? [{ key: 'tax', label: 'MwSt.', width: mm(13), align: 'right' as const }]
      : []),
    { key: 'total', label: 'Gesamt', width: mm(26), align: 'right' },
  ];

  const used = fixed.reduce((sum, column) => sum + column.width, 0);

  return [
    fixed[0],
    {
      key: 'name',
      label: 'Bezeichnung',
      width: CONTENT_WIDTH - used,
      align: 'left',
    },
    ...fixed.slice(1),
  ];
};

const senderLine = (letterhead: PdfLetterhead | null): string =>
  letterhead === null
    ? ''
    : [
        letterhead.companyName,
        letterhead.street,
        [letterhead.postalCode, letterhead.city].filter(Boolean).join(' '),
      ]
        .filter((part) => part !== null && part !== '')
        .join(' · ');

const drawPaymentQr = (
  doc: PDFKit.PDFDocument,
  qrInput: { payload: string; caption: string },
): void => {
  const size = mm(26);
  const qr = qrcode(0, 'M');

  qr.addData(Buffer.from(qrInput.payload, 'utf8').toString('latin1'), 'Byte');
  qr.make();

  const count = qr.getModuleCount();
  const cell = size / count;

  let top = doc.y + mm(6);

  if (top + size > BOTTOM_LIMIT) {
    doc.addPage();
    top = mm(25);
  }

  doc.save().fillColor('#000000');

  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) {
        doc
          .rect(
            LEFT + column * cell,
            top + row * cell,
            cell + 0.05,
            cell + 0.05,
          )
          .fill();
      }
    }
  }

  doc.restore();

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#333333')
    .text(qrInput.caption, LEFT + size + mm(5), top + mm(2), {
      width: CONTENT_WIDTH - size - mm(5),
    });

  doc.y = top + size;
};

const drawUnterschrift = (doc: PDFKit.PDFDocument, satz: string): void => {
  const hoehe = mm(30);
  let top = doc.y + mm(10);

  if (top + hoehe > BOTTOM_LIMIT) {
    doc.addPage();
    top = mm(25);
  }

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#000000')
    .text(satz, LEFT, top, { width: CONTENT_WIDTH });

  const linie = top + mm(20);
  const datumBreite = mm(50);
  const abstand = mm(10);

  doc
    .save()
    .lineWidth(0.6)
    .strokeColor('#333333')
    .moveTo(LEFT, linie)
    .lineTo(LEFT + datumBreite, linie)
    .moveTo(LEFT + datumBreite + abstand, linie)
    .lineTo(LEFT + CONTENT_WIDTH, linie)
    .stroke()
    .restore();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#555555')
    .text('Datum', LEFT, linie + mm(1.5), {
      width: datumBreite,
      lineBreak: false,
    })
    .text(
      'Unterschrift und Name in Druckbuchstaben',
      LEFT + datumBreite + abstand,
      linie + mm(1.5),
      { width: CONTENT_WIDTH - datumBreite - abstand, lineBreak: false },
    );

  doc.y = linie + mm(6);
};

export const footerColumns = (letterhead: PdfLetterhead | null): string[][] => {
  if (letterhead === null) {
    return [];
  }

  const address = [
    letterhead.companyName,
    letterhead.street,
    [letterhead.postalCode, letterhead.city].filter(Boolean).join(' ') || null,
    letterhead.country,
  ];

  const contact = [
    letterhead.phone === null ? null : `Tel. ${letterhead.phone}`,
    letterhead.email,
    letterhead.website,
    letterhead.representative === null
      ? null
      : `Vertretung: ${letterhead.representative}`,
  ];

  const fiscal = [
    letterhead.registerEntry,
    letterhead.taxNumber === null ? null : `Steuernr. ${letterhead.taxNumber}`,
    letterhead.vatId === null ? null : `USt-IdNr. ${letterhead.vatId}`,
    letterhead.bankName,
    letterhead.iban === null ? null : formatIban(letterhead.iban),
    letterhead.bic === null ? null : `BIC ${letterhead.bic}`,
  ];

  return [address, contact, fiscal].map((column) =>
    column.filter((entry): entry is string => entry !== null && entry !== ''),
  );
};

export const renderDocumentPdf = (input: DocumentPdfInput): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: {
      top: mm(20),
      left: LEFT,
      right: RIGHT,
      bottom: PAGE_HEIGHT - BOTTOM_LIMIT,
    },
    info: {
      Title: `${input.documentLabel} ${input.number}`,
      Author: input.letterhead?.companyName ?? 'Stegwerk',
      Subject: `${input.documentLabel} ${input.number}`,
    },
    ...(input.eRechnung == null ? {} : PDFA_OPTIONEN),
  });

  if (input.eRechnung != null) {
    schriftenEinbetten(doc);
    eRechnungAnhaengen(doc, input.eRechnung);
  }

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ohnePreise = input.ohnePreise === true;
  const columns = columnsFor(input.lines, input.smallBusiness, ohnePreise);
  const money = (cents: number) => `${formatAmount(cents)} €`;

  const marks = () => {
    doc.save().lineWidth(0.4).strokeColor('#999999');

    for (const y of [FOLD_UPPER, PUNCH, FOLD_LOWER]) {
      doc
        .moveTo(mm(5), y)
        .lineTo(mm(y === PUNCH ? 12 : 10), y)
        .stroke();
    }

    doc.restore();
  };

  marks();

  let imTabellenText: { size: number; color: string } | null = null;
  let tabellenkopf: ((y: number) => number) | null = null;

  doc.on('pageAdded', () => {
    marks();

    if (imTabellenText !== null && tabellenkopf !== null) {
      const weiter = imTabellenText;

      doc.y = tabellenkopf(mm(25));
      doc.font('Helvetica').fontSize(weiter.size).fillColor(weiter.color);
    }
  });

  const logo = input.letterhead?.logo ?? null;

  if (logo !== null && logo.length > 0) {
    try {
      doc.image(logo, PAGE_WIDTH - RIGHT - LOGO_WIDTH, LOGO_TOP, {
        fit: [LOGO_WIDTH, LOGO_HEIGHT],
        align: 'right',
      });
    } catch {}
  }

  const sender = senderLine(input.letterhead);

  if (sender !== '') {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#555555')
      .text(sender, LEFT, ADDRESS_TOP, { width: mm(85), lineBreak: false });
  }

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#000000')
    .text(input.recipientAddress ?? '', LEFT, ADDRESS_TOP + mm(6), {
      width: mm(85),
    });

  let infoY = ADDRESS_TOP;

  for (const [label, value] of input.infoRows) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(label, INFO_LEFT, infoY, { width: mm(65), lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000000')
      .text(value, INFO_LEFT, infoY + mm(3.4), {
        width: mm(65),
        lineBreak: false,
      });
    infoY += mm(9);
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#000000')
    .text(
      `${input.documentLabel} ${input.number}`,
      LEFT,
      Math.max(SUBJECT_TOP, infoY + mm(2)),
      {
        width: CONTENT_WIDTH,
      },
    );

  doc.moveDown(1);

  if (input.introText !== null && input.introText.trim() !== '') {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(input.introText, LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(1);
  }

  const headerRow = (y: number): number => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');

    let x = LEFT;

    for (const column of columns) {
      doc.text(column.label, x, y, {
        width: column.width - mm(2),
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }

    const bottom = y + mm(4.5);

    doc
      .save()
      .lineWidth(0.7)
      .strokeColor('#333333')
      .moveTo(LEFT, bottom)
      .lineTo(LEFT + CONTENT_WIDTH, bottom)
      .stroke()
      .restore();

    return bottom + mm(2);
  };

  tabellenkopf = headerRow;

  const KOPF_HOEHE = mm(6.5);
  const NAECHSTE_SEITE_OBEN = mm(25) + KOPF_HOEHE;

  const passt = (top: number, hoehe: number): boolean =>
    hoehe <= BOTTOM_LIMIT - NAECHSTE_SEITE_OBEN
      ? top + hoehe <= BOTTOM_LIMIT
      : top + mm(30) <= BOTTOM_LIMIT;

  const zeilenHoehe = (line: PdfLine): number => {
    const nameColumn = columns.find((column) => column.key === 'name');
    const nameWidth = (nameColumn?.width ?? CONTENT_WIDTH) - mm(2);
    const subtitle = [line.articleNumber, line.description]
      .filter((part) => part !== null && part !== '')
      .join(' · ');
    const nameHeight = doc
      .font('Helvetica')
      .fontSize(9)
      .heightOfString(line.name, { width: nameWidth });
    const subtitleHeight =
      subtitle === ''
        ? 0
        : doc.fontSize(8).heightOfString(subtitle, { width: nameWidth }) +
          mm(0.5);

    return Math.max(nameHeight + subtitleHeight, mm(5)) + mm(2.5);
  };

  let kopfTop = doc.y + mm(2);
  const ersteZeile = input.lines[0];

  if (
    ersteZeile !== undefined &&
    !passt(kopfTop + KOPF_HOEHE, zeilenHoehe(ersteZeile))
  ) {
    doc.addPage();
    kopfTop = mm(25);
  }

  let y = headerRow(kopfTop);

  for (const line of input.lines) {
    const net = lineNetCents(line);
    const cells: Record<string, string> = {
      position: String(line.position + 1),
      name: line.name,
      quantity: formatQuantity(line.quantity),
      unit: line.unit,
      unitPrice: formatAmount(line.unitPriceCents),
      discount:
        line.discountPercent > 0
          ? `${formatQuantity(line.discountPercent)} %`
          : '',
      tax: `${String(line.taxRatePercent)} %`,
      total: formatAmount(net),
      offen:
        line.offen !== null && line.offen !== undefined && line.offen > 0
          ? formatQuantity(line.offen)
          : '',
    };

    const nameColumn = columns.find((column) => column.key === 'name');
    const nameWidth = (nameColumn?.width ?? CONTENT_WIDTH) - mm(2);
    const subtitle = [line.articleNumber, line.description]
      .filter((part) => part !== null && part !== '')
      .join(' · ');

    const nameHeight = doc
      .font('Helvetica')
      .fontSize(9)
      .heightOfString(line.name, { width: nameWidth });
    const rowHeight = zeilenHoehe(line);

    if (!passt(y, rowHeight)) {
      doc.addPage();
      y = headerRow(mm(25));
    }

    const seiteVorher = doc.bufferedPageRange().count;
    let x = LEFT;

    for (const column of columns) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#000000')
        .text(cells[column.key] ?? '', x, y, {
          width: column.width - mm(2),
          align: column.align,
          lineBreak: column.key === 'name',
        });
      x += column.width;
    }

    if (subtitle !== '') {
      imTabellenText = { size: 8, color: '#666666' };
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(subtitle, LEFT + columns[0].width, y + nameHeight + mm(0.5), {
          width: nameWidth,
        });
      imTabellenText = null;
    }

    y =
      doc.bufferedPageRange().count > seiteVorher
        ? doc.y + mm(2.5)
        : y + rowHeight;

    doc
      .save()
      .lineWidth(0.3)
      .strokeColor('#dddddd')
      .moveTo(LEFT, y - mm(1.2))
      .lineTo(LEFT + CONTENT_WIDTH, y - mm(1.2))
      .stroke()
      .restore();
  }

  const totalsWidth = mm(100);
  const valueWidth = mm(30);
  const totalsLeft = LEFT + CONTENT_WIDTH - totalsWidth;
  const befreiung = input.smallBusiness
    ? null
    : (input.steuerbefreiung ?? null);
  const totalRows: [string, string, boolean][] = [
    ['Nettobetrag', money(input.totals.netCents), false],
    ...input.totals.taxGroups.map((group): [string, string, boolean] => [
      input.smallBusiness
        ? 'Umsatzsteuer'
        : group.ratePercent === 0 && befreiung !== null
          ? `0 % USt. – ${befreiung.kurz}`
          : `zzgl. ${String(group.ratePercent)} % USt. auf ${money(group.netCents)}`,
      money(group.taxCents),
      false,
    ]),
    ['Gesamtbetrag', money(input.totals.grossCents), true],
  ];

  if (!ohnePreise && y + mm(9) * totalRows.length > BOTTOM_LIMIT) {
    doc.addPage();
    y = mm(25);
  }

  y += mm(2);

  for (const [label, value, strong] of ohnePreise ? [] : totalRows) {
    if (strong) {
      doc
        .save()
        .lineWidth(0.7)
        .strokeColor('#333333')
        .moveTo(totalsLeft, y - mm(1.5))
        .lineTo(LEFT + CONTENT_WIDTH, y - mm(1.5))
        .stroke()
        .restore();
    }

    doc
      .font(strong ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(strong ? 11 : 9.5)
      .fillColor('#000000')
      .text(label, totalsLeft, y, {
        width: totalsWidth - valueWidth,
        lineBreak: false,
      })
      .text(value, totalsLeft + totalsWidth - valueWidth, y, {
        width: valueWidth,
        align: 'right',
        lineBreak: false,
      });

    y += strong ? mm(8) : mm(5.5);
  }

  doc.y = y + mm(4);

  if (input.smallBusiness && !ohnePreise) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', LEFT, doc.y, {
        width: CONTENT_WIDTH,
      });
    doc.moveDown(0.6);
  }

  if (!ohnePreise && befreiung !== null && befreiung.hinweise.length > 0) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text(befreiung.hinweise.join('\n').replace(/§ /gu, '§ '), LEFT, doc.y, {
        width: CONTENT_WIDTH,
      });
    doc.moveDown(0.6);
  }

  for (const sentence of input.closingSentences) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000000')
      .text(sentence, LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.4);
  }

  if (input.closingText !== null && input.closingText.trim() !== '') {
    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(input.closingText, LEFT, doc.y, { width: CONTENT_WIDTH });
  }

  if (input.paymentQr !== null && input.paymentQr !== undefined) {
    drawPaymentQr(doc, input.paymentQr);
  }

  if (input.unterschrift !== null && input.unterschrift !== undefined) {
    drawUnterschrift(doc, input.unterschrift.satz);
  }

  const columnsOfFooter = footerColumns(input.letterhead);
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    const bottomMargin = doc.page.margins.bottom;

    doc.page.margins.bottom = 0;

    doc
      .save()
      .lineWidth(0.4)
      .strokeColor('#cccccc')
      .moveTo(LEFT, FOOTER_TOP - mm(3))
      .lineTo(LEFT + CONTENT_WIDTH, FOOTER_TOP - mm(3))
      .stroke()
      .restore();

    const columnWidth = CONTENT_WIDTH / 3;

    columnsOfFooter.forEach((block, blockIndex) => {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#666666')
        .text(block.join('\n'), LEFT + columnWidth * blockIndex, FOOTER_TOP, {
          width: columnWidth - mm(4),
        });
    });

    if (range.count > 1) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#666666')
        .text(
          `Seite ${String(index + 1)} von ${String(range.count)}`,
          LEFT,
          PAGE_HEIGHT - mm(12),
          { width: CONTENT_WIDTH, align: 'right', lineBreak: false },
        );
    }

    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();

  return done;
};
