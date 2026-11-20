import { describe, expect, it } from 'vitest';

import { XlsxFehler, xlsxZuCsv, xmlText } from './xlsx';

const deflate = async (daten: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(
    await new Response(
      new Blob([daten.slice()])
        .stream()
        .pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer(),
  );

const zip = async (
  dateien: Record<string, string>,
  gepackt = true,
): Promise<ArrayBuffer> => {
  const kodierer = new TextEncoder();
  const lokal: number[] = [];
  const zentral: number[] = [];
  const le16 = (z: number[], v: number) => z.push(v & 0xff, (v >> 8) & 0xff);
  const le32 = (z: number[], v: number) =>
    z.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);

  for (const [name, text] of Object.entries(dateien)) {
    const roh = kodierer.encode(text);
    const daten = gepackt ? await deflate(roh) : roh;
    const nameBytes = kodierer.encode(name);
    const versatz = lokal.length;

    le32(lokal, 0x04034b50);
    le16(lokal, 20);
    le16(lokal, 0);
    le16(lokal, gepackt ? 8 : 0);
    le32(lokal, 0);
    le32(lokal, 0);
    le32(lokal, daten.length);
    le32(lokal, roh.length);
    le16(lokal, nameBytes.length);
    le16(lokal, 0);
    lokal.push(...nameBytes, ...daten);

    le32(zentral, 0x02014b50);
    le16(zentral, 20);
    le16(zentral, 20);
    le16(zentral, 0);
    le16(zentral, gepackt ? 8 : 0);
    le32(zentral, 0);
    le32(zentral, 0);
    le32(zentral, daten.length);
    le32(zentral, roh.length);
    le16(zentral, nameBytes.length);
    le16(zentral, 0);
    le16(zentral, 0);
    le16(zentral, 0);
    le16(zentral, 0);
    le32(zentral, 0);
    le32(zentral, versatz);
    zentral.push(...nameBytes);
  }

  const ende: number[] = [];
  le32(ende, 0x06054b50);
  le16(ende, 0);
  le16(ende, 0);
  le16(ende, Object.keys(dateien).length);
  le16(ende, Object.keys(dateien).length);
  le32(ende, zentral.length);
  le32(ende, lokal.length);
  le16(ende, 0);

  return new Uint8Array([...lokal, ...zentral, ...ende]).buffer;
};

const MAPPE = `<?xml version="1.0"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Kunden" sheetId="1" r:id="rId1"/><sheet name="Zwei" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;

const BEZUEGE = `<?xml version="1.0"?>
<Relationships>
  <Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId1" Type="worksheet" Target="worksheets/kunden.xml"/>
</Relationships>`;

const GETEILT = `<sst count="4"><si><t>Name</t></si><si><t>Umsatz</t></si>
<si><r><t>Müller </t></r><r><t xml:space="preserve">&amp; Söhne</t></r></si>
<si><t>Abschluss</t></si></sst>`;

const STILE = `<styleSheet>
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.00 &quot;Std&quot;"/></numFmts>
<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs>
</styleSheet>`;

const BLATT = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="D1" t="inlineStr"><is><t>Notiz</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12500.5</v></c><c r="C2" s="1"><v>46327</v></c><c r="D2" t="inlineStr"><is><t>Sagt "ja", ruft an</t></is></c></row>
<row r="3"/>
<row r="5"><c r="A5" t="str"><f>A1</f><v>Formel</v></c><c r="C5" s="2"><v>45658</v></c><c r="E5" s="3"><v>7.5</v></c></row>
<row r="6"><c r="A6" t="e"><v>#NV</v></c><c r="B6" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;

const datei = (gepackt = true) =>
  zip(
    {
      'xl/workbook.xml': MAPPE,
      'xl/_rels/workbook.xml.rels': BEZUEGE,
      'xl/sharedStrings.xml': GETEILT,
      'xl/styles.xml': STILE,
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>falsch</t></is></c></row></sheetData></worksheet>',
      'xl/worksheets/kunden.xml': BLATT,
    },
    gepackt,
  );

describe('xlsxZuCsv', () => {
  it('liest das erste Blatt der Mappe als CSV', async () => {
    expect(await xlsxZuCsv(await datei())).toBe(
      [
        'Name,Umsatz,Abschluss,Notiz,',
        'Müller & Söhne,12500.5,2026-11-01,"Sagt ""ja"", ruft an",',
        'Formel,,2025-01-01,,7.5',
        ',1,,,',
      ].join('\n'),
    );
  });

  it('liest auch abgelegte, nicht gepackte Einträge', async () => {
    const csv = await xlsxZuCsv(await datei(false));

    expect(csv.split('\n')[0]).toBe('Name,Umsatz,Abschluss,Notiz,');
  });

  it('nimmt sheet1.xml, wenn die Mappe nichts sagt', async () => {
    const csv = await xlsxZuCsv(
      await zip({
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row r="1"><c r="B1"><v>3</v></c></row></sheetData></worksheet>',
      }),
    );

    expect(csv).toBe(',3');
  });

  it('weist eine Datei ab, die kein ZIP ist', async () => {
    await expect(
      xlsxZuCsv(new TextEncoder().encode('Name;Stadt\nA;B').buffer),
    ).rejects.toBeInstanceOf(XlsxFehler);
  });

  it('weist eine Mappe ohne Tabelle ab', async () => {
    await expect(
      xlsxZuCsv(await zip({ 'xl/workbook.xml': '<workbook/>' })),
    ).rejects.toThrow('keine Tabelle');
  });

  it('weist eine zu große Datei ab, bevor es entpackt', async () => {
    await expect(
      xlsxZuCsv(new ArrayBuffer(5 * 1024 * 1024 + 1)),
    ).rejects.toThrow('größer als 5 MB');
  });
});

describe('xmlText', () => {
  it('löst Entitäten und Excels _xHHHH_ auf', () => {
    expect(xmlText('a &lt;b&gt; &amp;amp; &#228;&#x00FC; Zeile_x000D_')).toBe(
      'a <b> &amp; äü Zeile\r',
    );
  });
});
