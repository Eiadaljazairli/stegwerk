import PDFDocument from 'pdfkit';

import {
  type DpaBlock,
  type DpaDocument,
  type DpaSection,
} from './dpa-document';

const MM = 2.834_645_669;
const mm = (value: number): number => value * MM;

const LEFT = mm(25);
const RIGHT = mm(20);
const TOP = mm(25);
const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const BOTTOM_LIMIT = mm(272);

const BODY = 9.5;
const LEADING = 3.2;

type Doc = InstanceType<typeof PDFDocument>;

const braucht = (doc: Doc, hoehe: number): void => {
  if (doc.y + hoehe > BOTTOM_LIMIT) {
    doc.addPage();
    doc.y = TOP;
  }
};

const absatz = (doc: Doc, inhalt: string, kursiv = false): void => {
  doc.font(kursiv ? 'Helvetica-Oblique' : 'Helvetica').fontSize(BODY);

  const hoehe = doc.heightOfString(inhalt, {
    width: CONTENT_WIDTH,
    lineGap: LEADING,
  });

  braucht(doc, Math.min(hoehe, 34));
  doc.text(inhalt, LEFT, doc.y, { width: CONTENT_WIDTH, lineGap: LEADING });
  doc.moveDown(0.55);
};

const punkte = (doc: Doc, eintraege: string[]): void => {
  doc.font('Helvetica').fontSize(BODY);

  for (const eintrag of eintraege) {
    const hoehe = doc.heightOfString(eintrag, {
      width: CONTENT_WIDTH - mm(6),
      lineGap: LEADING,
    });

    braucht(doc, Math.min(hoehe, 34));

    const y = doc.y;

    doc.text('•', LEFT, y, { width: mm(4) });
    doc.text(eintrag, LEFT + mm(6), y, {
      width: CONTENT_WIDTH - mm(6),
      lineGap: LEADING,
    });
    doc.moveDown(0.35);
  }

  doc.moveDown(0.3);
};

const block = (doc: Doc, inhalt: DpaBlock): void => {
  if (inhalt.kind === 'list') {
    punkte(doc, inhalt.items);

    return;
  }

  if (inhalt.kind === 'gap') {
    absatz(doc, `[Noch auszufüllen — ${inhalt.variable}] ${inhalt.text}`, true);

    return;
  }

  absatz(doc, inhalt.text);
};

const abschnitt = (doc: Doc, teil: DpaSection): void => {
  braucht(doc, mm(22));

  doc.font('Helvetica-Bold').fontSize(10.5);
  doc.text(`${teil.label}  ${teil.title}`, LEFT, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.4);

  for (const inhalt of teil.blocks) {
    block(doc, inhalt);
  }

  doc.moveDown(0.5);
};

const unterschriften = (doc: Doc): void => {
  braucht(doc, mm(45));
  doc.moveDown(1.5);

  const spalte = (CONTENT_WIDTH - mm(10)) / 2;
  const y = doc.y;

  for (const [index, rolle] of ['Auftraggeber', 'Auftragnehmer'].entries()) {
    const x = LEFT + index * (spalte + mm(10));

    doc.font('Helvetica').fontSize(8.5);
    doc.text('Ort, Datum', x, y, { width: spalte });
    doc
      .moveTo(x, y + mm(12))
      .lineTo(x + spalte, y + mm(12))
      .lineWidth(0.5)
      .stroke('#000000');

    doc.text('Unterschrift', x, y + mm(15), { width: spalte });
    doc
      .moveTo(x, y + mm(27))
      .lineTo(x + spalte, y + mm(27))
      .stroke('#000000');

    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text(rolle, x, y + mm(29), { width: spalte });
  }

  doc.y = y + mm(36);
};

export type DpaZusatz = {
  auftraggeber?: string;
  annahme?: string;
};

export const renderDpaPdf = (
  dokument: DpaDocument,
  zusatz: DpaZusatz = {},
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      bufferPages: true,
      margins: { top: TOP, left: LEFT, right: RIGHT, bottom: mm(25) },
      info: {
        Title: dokument.title,
        Author: dokument.processorName ?? 'Stegwerk',
      },
    });

    const stuecke: Buffer[] = [];

    doc.on('data', (stueck: Buffer) => stuecke.push(stueck));
    doc.on('end', () => resolve(Buffer.concat(stuecke)));
    doc.on('error', reject);

    doc.y = TOP;

    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(dokument.title, LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    doc.text('nach Art. 28 DSGVO', LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(1);

    if (!dokument.reviewed) {
      const hoehe = mm(16);

      doc
        .rect(LEFT, doc.y, CONTENT_WIDTH, hoehe)
        .lineWidth(0.8)
        .stroke('#9a5b06');

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#9a5b06');
      doc.text(
        'Entwurf — noch nicht rechtlich geprüft.',
        LEFT + mm(3),
        doc.y + mm(3),
        { width: CONTENT_WIDTH - mm(6) },
      );
      doc.font('Helvetica').fontSize(8);
      doc.text(
        'Die Beschreibung der Verarbeitung und der technischen Maßnahmen gibt den Stand der Software wieder. Die Klauseln ersetzen keine anwaltliche Prüfung. Nicht in diesem Zustand unterzeichnen.',
        LEFT + mm(3),
        doc.y + mm(0.5),
        { width: CONTENT_WIDTH - mm(6) },
      );
      doc.fillColor('#000000');

      doc.y = doc.y + mm(6);
      doc.moveDown(1);
    }

    doc.font('Helvetica').fontSize(BODY);
    absatz(
      doc,
      `zwischen ${
        zusatz.auftraggeber ?? '______________________________________________'
      } (nachfolgend "Auftraggeber")`,
    );
    absatz(
      doc,
      `und ${
        dokument.processorName ??
        '______________________________________________'
      } (nachfolgend "Auftragnehmer")`,
    );
    doc.moveDown(0.6);

    for (const teil of dokument.sections) {
      abschnitt(doc, teil);
    }

    for (const teil of dokument.annexes) {
      doc.addPage();
      doc.y = TOP;
      abschnitt(doc, teil);
    }

    unterschriften(doc);

    if (zusatz.annahme !== undefined) {
      doc.moveDown(1);
      absatz(doc, zusatz.annahme, true);
    }

    const bereich = doc.bufferedPageRange();

    for (let seite = 0; seite < bereich.count; seite += 1) {
      doc.switchToPage(bereich.start + seite);
      doc.font('Helvetica').fontSize(7.5).fillColor('#555555');
      doc.text(
        `Seite ${String(seite + 1)} von ${String(bereich.count)}`,
        LEFT,
        PAGE_HEIGHT - mm(18),
        { width: CONTENT_WIDTH, align: 'center' },
      );
    }

    doc.end();
  });
