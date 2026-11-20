export type BodyNode = {
  part?: string;
  type: string;
  parameters?: { charset?: string } & Record<string, string | undefined>;
  disposition?: string;
  dispositionParameters?: Record<string, string | undefined>;
  encoding?: string;
  childNodes?: BodyNode[];
  size?: number;
};

export type TextPart = {
  part: string;
  charset: string;
  html: boolean;
};

const charsetOf = (node: BodyNode): string =>
  node.parameters?.charset ?? 'utf-8';

const isAttachment = (node: BodyNode): boolean =>
  (node.disposition ?? '').toLowerCase() === 'attachment';

export const pickTextPart = (node: BodyNode): TextPart | null => {
  const plain = findText(node, 'text/plain');

  if (plain !== null) {
    return plain;
  }

  return findText(node, 'text/html');
};

const findText = (node: BodyNode, wanted: string): TextPart | null => {
  if (isAttachment(node)) {
    return null;
  }

  if (node.type === wanted) {
    return {
      part: node.part ?? '1',
      charset: charsetOf(node),
      html: wanted === 'text/html',
    };
  }

  for (const child of node.childNodes ?? []) {
    const found = findText(child, wanted);

    if (found !== null) {
      return found;
    }
  }

  return null;
};

export const decodeText = (bytes: Buffer, charset: string): string => {
  if (WINDOWS_1252.test(charset.trim())) {
    return windows1252(bytes);
  }

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
};

const WINDOWS_1252 =
  /^(windows-1252|cp1252|x-cp1252|iso-8859-1|iso8859-1|iso_8859-1|latin1|l1|us-ascii|ascii)$/iu;

const CP1252_OBEN = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d,
  0x017e, 0x0178,
];

const windows1252 = (bytes: Buffer): string => {
  let text = '';

  for (const byte of bytes) {
    text += String.fromCharCode(
      byte >= 0x80 && byte <= 0x9f ? CP1252_OBEN[byte - 0x80] : byte,
    );
  }

  return text;
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  euro: '€',
};

export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/giu, '\n')
    .replace(/<[^<>]*>/gu, ' ')
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/giu, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/[^\S\n]+/gu, ' ');

const ZITAT_HTML =
  /<blockquote\b|<div[^<>]*\b(?:class="gmail_quote|id="(?:divRplyFwdMsg|appendonsend)|class="moz-cite-prefix)/iu;

const ZITAT_SUCHE_HOECHSTENS = 200_000;

export const htmlOhneZitat = (html: string): string => htmlTeilen(html).eigen;

export const htmlTeilen = (html: string): { eigen: string; zitat: string } => {
  const treffer = ZITAT_HTML.exec(html.slice(0, ZITAT_SUCHE_HOECHSTENS));

  if (treffer === null) {
    return { eigen: html, zitat: '' };
  }

  const davor = html.slice(0, treffer.index);

  return htmlToText(davor).trim() === ''
    ? { eigen: html, zitat: '' }
    : { eigen: davor, zitat: html.slice(treffer.index) };
};

const KOPF_VON = /^(von|from):\s/iu;
const KOPF_DANACH = /^(gesendet|sent|datum|date):\s/iu;

const ATTRIBUTION =
  /^(am\s.+\sschrieb\s.*:|on\s.+\swrote:|[^<]*<[^<>]+>\s*(schrieb|wrote):|-{2,}\s*(ursprüngliche nachricht|original message)\s*-{2,})$/iu;

const ZITATZEILE_HOECHSTENS = 300;

const SNIPPET_QUELLE_HOECHSTENS = 20_000;

const DEFAULT_LIMIT = 200;

export const snippetOf = (
  body: string,
  limit: number = DEFAULT_LIMIT,
): string => {
  const lines = body.slice(0, SNIPPET_QUELLE_HOECHSTENS).split(/\r?\n/u);
  const kept: string[] = [];

  for (const [stelle, line] of lines.entries()) {
    const trimmed = line.trim();

    if (trimmed === '--' || line === '-- ') {
      break;
    }

    if (trimmed.startsWith('>')) {
      continue;
    }

    if (trimmed.length <= ZITATZEILE_HOECHSTENS && ATTRIBUTION.test(trimmed)) {
      break;
    }

    if (
      KOPF_VON.test(trimmed) &&
      KOPF_DANACH.test((lines[stelle + 1] ?? '').trim())
    ) {
      break;
    }

    kept.push(trimmed);
  }

  const cleaned = collapse(kept.join(' '));

  return cut(
    cleaned === ''
      ? collapse(body.slice(0, SNIPPET_QUELLE_HOECHSTENS))
      : cleaned,
    limit,
  );
};

const collapse = (text: string): string => text.replace(/\s+/gu, ' ').trim();

const cut = (text: string, limit: number): string => {
  if (text.length <= limit) {
    return text;
  }

  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');

  return `${(lastSpace > limit / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
};

export const subjectOf = (raw: string | null | undefined): string | null => {
  const trimmed = (raw ?? '').trim();

  return trimmed === '' ? null : trimmed.slice(0, 500);
};

export const INHALT_HOECHSTENS = 60_000;

export const teileText = (body: string): { eigen: string; rest: string } => {
  const text = body.replace(/\r\n?/gu, '\n').slice(0, INHALT_HOECHSTENS);
  const lines = text.split('\n');
  let schnitt = lines.length;

  for (const [stelle, line] of lines.entries()) {
    const trimmed = line.trim();

    if (
      trimmed === '--' ||
      line === '-- ' ||
      (trimmed.length <= ZITATZEILE_HOECHSTENS && ATTRIBUTION.test(trimmed)) ||
      (KOPF_VON.test(trimmed) &&
        KOPF_DANACH.test((lines[stelle + 1] ?? '').trim()))
    ) {
      schnitt = stelle;
      break;
    }
  }

  let ende = schnitt;

  while (
    ende > 0 &&
    (lines[ende - 1].trim() === '' || lines[ende - 1].trim().startsWith('>'))
  ) {
    ende -= 1;
  }

  if (
    ende < schnitt &&
    lines.slice(ende, schnitt).some((line) => line.trim().startsWith('>'))
  ) {
    schnitt = ende;
  }

  const eigen = lines.slice(0, schnitt).join('\n').trim();
  const rest = lines.slice(schnitt).join('\n').trim();

  return eigen === '' ? { eigen: rest, rest: '' } : { eigen, rest };
};

const ANHAENGE_HOECHSTENS = 20;

const KEIN_ANHANG =
  /^(multipart\/|message\/(delivery-status|global-delivery-status|disposition-notification)|text\/calendar|application\/(pkcs7-signature|x-pkcs7-signature|pgp-signature|ics))/iu;

export type AnhangImPostfach = {
  teil: string;
  name: string;
  mimeType: string;
  groesse: number;
};

export const anhaengeVon = (
  wurzel: BodyNode | undefined,
): AnhangImPostfach[] => {
  const gefunden: AnhangImPostfach[] = [];

  const besuchen = (knoten: BodyNode, tiefe: number): void => {
    if (gefunden.length >= ANHAENGE_HOECHSTENS || tiefe > 20) {
      return;
    }

    for (const kind of knoten.childNodes ?? []) {
      besuchen(kind, tiefe + 1);
    }

    const typ = knoten.type.toLowerCase();

    if (KEIN_ANHANG.test(typ) || (knoten.childNodes ?? []).length > 0) {
      return;
    }

    const disposition = (knoten.disposition ?? '').toLowerCase();
    const name =
      knoten.dispositionParameters?.filename ?? knoten.parameters?.name ?? '';

    const istAnhang =
      disposition === 'attachment' ||
      (disposition !== 'inline' && name.trim() !== '');

    if (!istAnhang || gefunden.length >= ANHAENGE_HOECHSTENS) {
      return;
    }

    const roh = knoten.size ?? 0;

    gefunden.push({
      teil: knoten.part ?? '1',
      name: (name.trim() === '' ? 'anhang' : name.trim()).slice(0, 180),
      mimeType: typ.slice(0, 180),
      groesse:
        (knoten.encoding ?? '').toLowerCase() === 'base64'
          ? Math.floor((roh * 3) / 4)
          : roh,
    });
  };

  if (wurzel !== undefined) {
    besuchen(wurzel, 0);
  }

  return gefunden;
};
