import { isValidIban } from '../quotes/letterhead-checks';

export type GiroCodeInput = {
  name: string | null;
  iban: string | null;
  bic: string | null;
  amountCents: number;
  currency: string;
  reference: string;
};

const HOECHSTENS = 99_999_999_999;

export const giroCode = (input: GiroCodeInput): string | null => {
  const iban = (input.iban ?? '').replace(/[\s-]/gu, '').toUpperCase();
  const name = (input.name ?? '').trim().slice(0, 70);

  if (
    !isValidIban(iban) ||
    name === '' ||
    input.currency !== 'EUR' ||
    input.amountCents <= 0 ||
    input.amountCents > HOECHSTENS
  ) {
    return null;
  }

  const euro = Math.floor(input.amountCents / 100);
  const cent = String(input.amountCents % 100).padStart(2, '0');

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    (input.bic ?? '').replace(/\s/gu, '').toUpperCase(),
    name,
    iban,
    `EUR${String(euro)}.${cent}`,
    '',
    '',
    input.reference.trim().slice(0, 140),
  ].join('\n');
};
