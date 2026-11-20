import { type LetterheadEntity } from '../quotes/letterhead.entity';

export const ABSENDER_FELDER = [
  'companyName',
  'street',
  'postalCode',
  'city',
  'country',
  'phone',
  'email',
  'website',
  'representative',
  'registerEntry',
  'taxNumber',
  'vatId',
  'bankName',
  'iban',
  'bic',
] as const;

export const absenderKopie = (
  briefkopf: LetterheadEntity | null,
): Record<string, unknown> =>
  Object.fromEntries(
    ABSENDER_FELDER.map((feld) => [feld, briefkopf?.[feld] ?? null]),
  );

export const briefkopfFuer = (
  heute: LetterheadEntity,
  kopie: Record<string, unknown> | null,
): LetterheadEntity =>
  kopie === null ? heute : ({ ...heute, ...kopie } as LetterheadEntity);
