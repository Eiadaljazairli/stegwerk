export const XLSX_MAX_BYTES = 5 * 1024 * 1024;

const ENTPACKT_MAX_BYTES = 60 * 1024 * 1024;

export class XlsxFehler extends Error {}

type Eintrag = {
  methode: number;
  groesse: number;
  daten: Uint8Array;
};

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const zipLesen = (b: Uint8Array): Map<string, Eintrag> => {
  let ende = -1;

  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(b, i) === 0x06054b50) {
      ende = i;
      break;
    }
  }

  if (ende < 0) {
    throw new XlsxFehler('Das ist keine Excel-Datei (.xlsx).');
  }

  const anzahl = u16(b, ende + 10);
  let pos = u32(b, ende + 16);
  const eintraege = new Map<string, Eintrag>();
  const dekoder = new TextDecoder();

  for (let n = 0; n < anzahl; n++) {
    if (u32(b, pos) !== 0x02014b50) {
      throw new XlsxFehler('Die Excel-Datei ist beschädigt.');
    }

    const methode = u16(b, pos + 10);
    const gepackt = u32(b, pos + 20);
    const groesse = u32(b, pos + 24);
    const nameLaenge = u16(b, pos + 28);
    const extraLaenge = u16(b, pos + 30);
    const kommentarLaenge = u16(b, pos + 32);
    const lokal = u32(b, pos + 42);
    const name = dekoder.decode(b.subarray(pos + 46, pos + 46 + nameLaenge));

    if (u32(b, lokal) !== 0x04034b50) {
      throw new XlsxFehler('Die Excel-Datei ist beschädigt.');
    }

    const start = lokal + 30 + u16(b, lokal + 26) + u16(b, lokal + 28);

    eintraege.set(name, {
      methode,
      groesse,
      daten: b.subarray(start, start + gepackt),
    });

    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }

  return eintraege;
};

const entpacken = async (eintrag: Eintrag): Promise<string> => {
  if (eintrag.groesse > ENTPACKT_MAX_BYTES) {
    throw new XlsxFehler('Die Excel-Datei ist zu groß.');
  }

  if (eintrag.methode === 0) {
    return new TextDecoder().decode(eintrag.daten);
  }

  if (eintrag.methode !== 8) {
    throw new XlsxFehler(
      'Diese Excel-Datei ist auf eine unbekannte Art gepackt.',
    );
  }

  const strom = new Blob([eintrag.daten.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const leser = strom.getReader();
  const teile: Uint8Array[] = [];
  let gesamt = 0;

  for (;;) {
    const { done, value } = await leser.read();

    if (done) {
      break;
    }

    gesamt += value.length;

    if (gesamt > ENTPACKT_MAX_BYTES) {
      await leser.cancel();
      throw new XlsxFehler('Die Excel-Datei ist zu groß.');
    }

    teile.push(value);
  }

  const alles = new Uint8Array(gesamt);
  let o = 0;

  for (const teil of teile) {
    alles.set(teil, o);
    o += teil.length;
  }

  return new TextDecoder().decode(alles);
};

export const xmlText = (roh: string): string =>
  roh
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_, dez: string) =>
      String.fromCodePoint(Number.parseInt(dez, 10)),
    )
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/_x([0-9a-f]{4})_/giu, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );

const laeufe = (xml: string): string =>
  [
    ...xml
      .replace(/<rPh\b[\s\S]*?<\/rPh>/gu, '')
      .matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/gu),
  ]
    .map((treffer) => xmlText(treffer[1] ?? ''))
    .join('');

const attribut = (attribute: string, name: string): string | null => {
  const treffer = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u').exec(attribute);

  return treffer === null ? null : xmlText(treffer[1]);
};

const spaltenIndex = (bezug: string): number => {
  const buchstaben = /^[A-Z]+/u.exec(bezug)?.[0] ?? 'A';
  let index = 0;

  for (const zeichen of buchstaben) {
    index = index * 26 + (zeichen.charCodeAt(0) - 64);
  }

  return index - 1;
};

const DATUMS_FORMATE = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
]);

const datumsStile = (stileXml: string | null): Set<number> => {
  const stile = new Set<number>();

  if (stileXml === null) {
    return stile;
  }

  const eigene = new Map<number, string>();

  for (const treffer of stileXml.matchAll(/<numFmt\b([^>]*)\/?>/gu)) {
    const id = Number(attribut(treffer[1], 'numFmtId'));
    const code = attribut(treffer[1], 'formatCode') ?? '';

    eigene.set(id, code);
  }

  const xfs =
    /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/u.exec(stileXml)?.[1] ?? '';

  [...xfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/gu)].forEach((treffer, index) => {
    const formatId = Number(attribut(treffer[1], 'numFmtId') ?? '0');
    const code = eigene.get(formatId);
    const istDatum =
      DATUMS_FORMATE.has(formatId) ||
      (code !== undefined &&
        /[dmy]/iu.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./gu, '')));

    if (istDatum) {
      stile.add(index);
    }
  });

  return stile;
};

const datumAusSerie = (serie: number): string => {
  const ms = Math.round((serie - 25569) * 86_400_000);

  return new Date(ms).toISOString().slice(0, 10);
};

const csvFeld = (wert: string): string =>
  /[",;\r\n]/u.test(wert) ? `"${wert.replace(/"/gu, '""')}"` : wert;

const erstesBlatt = (
  dateien: Map<string, Eintrag>,
  mappe: string | null,
  bezuege: string | null,
): string => {
  const rid =
    mappe === null
      ? null
      : (/<sheet\b[^>]*?\br:id="([^"]+)"/u.exec(mappe)?.[1] ?? null);

  if (rid !== null && bezuege !== null) {
    for (const treffer of bezuege.matchAll(/<Relationship\b([^>]*)\/?>/gu)) {
      if (attribut(treffer[1], 'Id') === rid) {
        const ziel = attribut(treffer[1], 'Target') ?? '';
        const pfad = ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel}`;

        if (dateien.has(pfad)) {
          return pfad;
        }
      }
    }
  }

  return 'xl/worksheets/sheet1.xml';
};

export const xlsxZuCsv = async (inhalt: ArrayBuffer): Promise<string> => {
  if (inhalt.byteLength > XLSX_MAX_BYTES) {
    throw new XlsxFehler(
      'Die Excel-Datei ist größer als 5 MB. Teilen Sie sie bitte auf.',
    );
  }

  const dateien = zipLesen(new Uint8Array(inhalt));
  const lies = async (name: string): Promise<string | null> => {
    const eintrag = dateien.get(name);

    return eintrag === undefined ? null : entpacken(eintrag);
  };

  const blattName = erstesBlatt(
    dateien,
    await lies('xl/workbook.xml'),
    await lies('xl/_rels/workbook.xml.rels'),
  );
  const blatt = await lies(blattName);

  if (blatt === null) {
    throw new XlsxFehler('In der Excel-Datei steht keine Tabelle.');
  }

  const geteilt = [
    ...((await lies('xl/sharedStrings.xml')) ?? '').matchAll(
      /<si\b[^>]*>([\s\S]*?)<\/si>/gu,
    ),
  ].map((treffer) => laeufe(treffer[1]));
  const daten = datumsStile(await lies('xl/styles.xml'));

  const zeilen: string[][] = [];

  for (const zeile of blatt.matchAll(
    /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gu,
  )) {
    const werte: string[] = [];
    let naechste = 0;

    for (const zelle of (zeile[2] ?? '').matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu,
    )) {
      const bezug = attribut(zelle[1], 'r');
      const spalte = bezug === null ? naechste : spaltenIndex(bezug);
      const typ = attribut(zelle[1], 't');
      const stil = Number(attribut(zelle[1], 's') ?? '0');
      const innen = zelle[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(innen)?.[1];
      let wert = '';

      if (typ === 's') {
        wert = geteilt[Number(v)] ?? '';
      } else if (typ === 'inlineStr') {
        wert = laeufe(/<is\b[^>]*>([\s\S]*?)<\/is>/u.exec(innen)?.[1] ?? '');
      } else if (typ === 'e') {
        wert = '';
      } else if (v !== undefined) {
        wert = xmlText(v);

        if ((typ === null || typ === 'n') && daten.has(stil)) {
          const zahl = Number(wert);

          if (Number.isFinite(zahl)) {
            wert = datumAusSerie(zahl);
          }
        }
      }

      while (werte.length < spalte) {
        werte.push('');
      }

      werte[spalte] = wert;
      naechste = spalte + 1;
    }

    if (werte.some((wert) => wert !== '')) {
      zeilen.push(werte);
    }
  }

  const breite = Math.max(0, ...zeilen.map((zeile) => zeile.length));

  return zeilen
    .map((zeile) =>
      Array.from({ length: breite }, (_, i) => csvFeld(zeile[i] ?? '')).join(
        ',',
      ),
    )
    .join('\n');
};
