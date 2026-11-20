export type LetterheadGap = {
  field: string;
  label: string;
};

type LetterheadLike = {
  companyName: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  representative: string | null;
  taxNumber: string | null;
  vatId: string | null;
  iban: string | null;
};

export const isValidIban = (value: string): boolean => {
  const iban = value.replace(/[\s-]/gu, '').toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban)) {
    return false;
  }

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;

  for (const character of rearranged) {
    const digits =
      character >= 'A' && character <= 'Z'
        ? String(character.charCodeAt(0) - 55)
        : character;

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
};

export const formatIban = (value: string): string =>
  value
    .replace(/[\s-]/gu, '')
    .toUpperCase()
    .replace(/(.{4})/gu, '$1 ')
    .trim();

export const isValidVatId = (value: string): boolean => {
  const vatId = value.replace(/[\s-]/gu, '').toUpperCase();

  if (!/^[A-Z]{2}[A-Z0-9]{2,12}$/u.test(vatId)) {
    return false;
  }

  return vatId.startsWith('DE') ? /^DE\d{9}$/u.test(vatId) : true;
};

export const letterheadGaps = (
  letterhead: LetterheadLike | null,
): LetterheadGap[] => {
  if (letterhead === null) {
    return [{ field: 'companyName', label: 'Firmenname' }];
  }

  const gaps: LetterheadGap[] = [];
  const missing = (value: string | null): boolean =>
    value === null || value.trim() === '';

  if (missing(letterhead.companyName)) {
    gaps.push({ field: 'companyName', label: 'Firmenname' });
  }

  if (missing(letterhead.street)) {
    gaps.push({ field: 'street', label: 'Straße' });
  }

  if (missing(letterhead.postalCode) || missing(letterhead.city)) {
    gaps.push({ field: 'city', label: 'PLZ und Ort' });
  }

  if (missing(letterhead.representative)) {
    gaps.push({ field: 'representative', label: 'Vertretungsberechtigte:r' });
  }

  if (missing(letterhead.taxNumber) && missing(letterhead.vatId)) {
    gaps.push({
      field: 'taxNumber',
      label: 'Steuernummer oder USt-IdNr.',
    });
  }

  if (missing(letterhead.iban)) {
    gaps.push({ field: 'iban', label: 'IBAN' });
  }

  return gaps;
};
