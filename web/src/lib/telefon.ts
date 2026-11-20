import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const formatTelefon = (wert: string | null | undefined): string => {
  if (wert === null || wert === undefined || wert.trim() === '') {
    return '—';
  }

  const nummer = parsePhoneNumberFromString(wert, 'DE');

  if (nummer === undefined || !nummer.isValid()) {
    return wert;
  }

  return nummer.country === 'DE'
    ? nummer.formatNational()
    : nummer.formatInternational();
};

export const telLink = (wert: string): string => {
  const nummer = parsePhoneNumberFromString(wert, 'DE');

  return `tel:${
    nummer !== undefined && nummer.isValid()
      ? nummer.number
      : wert.replace(/[^\d+]/gu, '')
  }`;
};
