export const kopfzeile = (
  roh: string | null | undefined,
  name: string,
): string | null => {
  if (roh === null || roh === undefined || roh === '') {
    return null;
  }

  const zeilen = roh.replace(/\r\n/gu, '\n').split('\n');
  const gesucht = `${name.toLowerCase()}:`;
  let gefunden: string | null = null;

  for (const zeile of zeilen) {
    if (gefunden !== null) {
      if (/^[ \t]/u.test(zeile)) {
        gefunden += ` ${zeile.trim()}`;
        continue;
      }

      break;
    }

    if (zeile.toLowerCase().startsWith(gesucht)) {
      gefunden = zeile.slice(gesucht.length).trim();
    }
  }

  return gefunden === null || gefunden === '' ? null : gefunden;
};
