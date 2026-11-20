import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SCHRIFTEN = join(__dirname, 'schriften');

export const SCHRIFT_NORMAL = join(SCHRIFTEN, 'LiberationSans-Regular.ttf');
const SCHRIFT_FETT = join(SCHRIFTEN, 'LiberationSans-Bold.ttf');

export const PDFA_OPTIONEN = {
  pdfVersion: '1.7',
  subset: 'PDF/A-3b',
  lang: 'de-DE',
  font: SCHRIFT_NORMAL,
} as const;

export const schriftenEinbetten = (doc: PDFKit.PDFDocument): void => {
  doc.registerFont('Helvetica', SCHRIFT_NORMAL);
  doc.registerFont('Helvetica-Bold', SCHRIFT_FETT);
};

export const istCmykJpeg = (bild: Buffer): boolean => {
  if (bild.length < 4 || bild[0] !== 0xff || bild[1] !== 0xd8) {
    return false;
  }

  let stelle = 2;

  while (stelle + 9 < bild.length) {
    if (bild[stelle] !== 0xff) {
      return false;
    }

    const marke = bild[stelle + 1];
    const laenge = bild.readUInt16BE(stelle + 2);

    if (
      marke >= 0xc0 &&
      marke <= 0xcf &&
      marke !== 0xc4 &&
      marke !== 0xc8 &&
      marke !== 0xcc
    ) {
      return bild[stelle + 9] === 4;
    }

    stelle += 2 + laenge;
  }

  return false;
};

const xml = (wert: string): string =>
  wert
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

type PdfkitIntern = {
  info: Record<string, unknown>;
  _root: { data: Record<string, unknown> };
  ref: (daten: Record<string, unknown>) => { end: (inhalt?: Buffer) => void };
  addNamedEmbeddedFile: (name: string, ref: unknown) => void;
  appendXML: (xml: string, newline?: boolean) => void;
  _addInfo: () => void;
  subset: number | undefined;
  _fontFamilies: Record<string, { finalize: () => void }>;
};

export type ERechnungAnhang = {
  xml: string;
  dateiname: string;
  profil: string;
};

export const eRechnungAnhaengen = (
  doc: PDFKit.PDFDocument,
  anhang: ERechnungAnhang,
): void => {
  const intern = doc as unknown as PdfkitIntern;
  const daten = Buffer.from(anhang.xml, 'utf8');
  const jetzt = new Date();

  const datei = intern.ref({
    Type: 'EmbeddedFile',
    Subtype: 'text#2Fxml',
    Params: {
      CheckSum: createHash('md5').update(daten).digest(),
      Size: daten.length,
      CreationDate: jetzt,
      ModDate: jetzt,
    },
  });

  datei.end(daten);

  const beschreibung = intern.ref({
    Type: 'Filespec',
    F: new String(anhang.dateiname),
    UF: new String(anhang.dateiname),
    EF: { F: datei, UF: datei },
    Desc: new String('Factur-X/ZUGFeRD-Rechnung'),
    AFRelationship: 'Alternative',
  });

  beschreibung.end();
  intern.addNamedEmbeddedFile(anhang.dateiname, beschreibung);
  intern._root.data.AF = [beschreibung];

  const ende = doc.end.bind(doc);

  doc.end = () => {
    const stufe = intern.subset;

    intern.subset = undefined;

    try {
      for (const schrift of Object.values(intern._fontFamilies)) {
        schrift.finalize();
      }
    } finally {
      intern.subset = stufe;
    }

    ende();
  };

  intern._addInfo = () => {
    const info = intern.info;
    const text = (schluessel: string): string =>
      xml(String(info[schluessel] ?? ''));
    const erstellt = (info.CreationDate as Date).toISOString();

    intern.appendXML(
      [
        '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
        `<xmp:CreateDate>${erstellt.split('.')[0]}Z</xmp:CreateDate>`,
        `<xmp:CreatorTool>${text('Creator')}</xmp:CreatorTool>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${text('Title')}</rdf:li></rdf:Alt></dc:title>`,
        `<dc:creator><rdf:Seq><rdf:li>${text('Author')}</rdf:li></rdf:Seq></dc:creator>`,
        `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${text('Subject')}</rdf:li></rdf:Alt></dc:description>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
        `<pdf:Producer>${text('Producer')}</pdf:Producer>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">',
        '<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">',
        '<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>',
        '<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>',
        '<pdfaSchema:prefix>fx</pdfaSchema:prefix>',
        '<pdfaSchema:property><rdf:Seq>',
        ...[
          ['DocumentFileName', 'The name of the embedded XML document'],
          [
            'DocumentType',
            'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER',
          ],
          [
            'Version',
            'The actual version of the standard applying to the embedded XML document',
          ],
          [
            'ConformanceLevel',
            'The conformance level of the embedded XML document',
          ],
        ].map(
          ([name, beschreibungText]) =>
            `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${beschreibungText}</pdfaProperty:description></rdf:li>`,
        ),
        '</rdf:Seq></pdfaSchema:property>',
        '</rdf:li></rdf:Bag></pdfaExtension:schemas>',
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
        '<fx:DocumentType>INVOICE</fx:DocumentType>',
        `<fx:DocumentFileName>${xml(anhang.dateiname)}</fx:DocumentFileName>`,
        '<fx:Version>1.0</fx:Version>',
        `<fx:ConformanceLevel>${xml(anhang.profil)}</fx:ConformanceLevel>`,
        '</rdf:Description>',
      ].join('\n'),
    );
  };
};
