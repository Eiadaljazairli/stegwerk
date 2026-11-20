export const leseZahl = (roh: string): number | null | undefined => {
  const text = roh
    .trim()
    .replace(/[\s  ]/gu, '')
    .replace(/(€|eur|euro)$/iu, '')
    .replace(/^(€|eur)/iu, '');

  if (text === '') {
    return null;
  }

  let normal: string;

  if (text.includes(',')) {
    if (!/^[-+]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/u.test(text)) {
      return undefined;
    }

    normal = text.replace(/\./gu, '').replace(',', '.');
  } else if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/u.test(text)) {
    normal = text.replace(/\./gu, '');
  } else if (/^[-+]?(\d+(\.\d*)?|\.\d+)$/u.test(text)) {
    normal = text;
  } else {
    return undefined;
  }

  const zahl = Number(normal);

  return Number.isFinite(zahl) ? zahl : undefined;
};
