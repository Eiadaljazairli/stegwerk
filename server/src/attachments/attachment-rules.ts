export const MAX_BYTES = 20 * 1024 * 1024;

const MAX_NAME_LENGTH = 180;

const VERBOTENE_ENDUNGEN = [
  'html',
  'htm',
  'xhtml',
  'svg',
  'xml',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'exe',
  'com',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'msi',
  'scr',
  'jar',
  'php',
  'phtml',
  'asp',
  'aspx',
  'jsp',
];

export class AttachmentAbgelehnt extends Error {
  constructor(grund: string) {
    super(grund);
    this.name = 'AttachmentAbgelehnt';
  }
}

export const sichererName = (roh: string): string => {
  const nurBlatt = roh.split(/[/\\]/u).pop() ?? '';

  // oxlint-disable-next-line no-control-regex
  const ohneSteuerzeichen = nurBlatt.replace(/[\u0000-\u001f\u007f]/gu, '');

  const getrimmt = ohneSteuerzeichen
    .replace(/["\\]/gu, '')
    .trim()
    .replace(/^\.+$/u, '');

  if (getrimmt === '') {
    return 'datei';
  }

  return getrimmt.slice(0, MAX_NAME_LENGTH);
};

export const endungVon = (name: string): string | null => {
  const punkt = name.lastIndexOf('.');

  if (punkt <= 0 || punkt === name.length - 1) {
    return null;
  }

  return name.slice(punkt + 1).toLowerCase();
};

export const pruefeAnhang = (input: {
  name: string;
  sizeBytes: number;
}): string => {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new AttachmentAbgelehnt('Die Datei ist leer.');
  }

  if (input.sizeBytes > MAX_BYTES) {
    throw new AttachmentAbgelehnt(
      `Die Datei ist größer als ${String(MAX_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const name = sichererName(input.name);
  const endung = endungVon(name);

  if (endung !== null && VERBOTENE_ENDUNGEN.includes(endung)) {
    throw new AttachmentAbgelehnt(
      `Dateien vom Typ .${endung} werden nicht angenommen.`,
    );
  }

  return name;
};

export const contentDisposition = (name: string): string => {
  const sicher = sichererName(name);
  const ascii = sicher.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '');

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    sicher,
  )}`;
};
