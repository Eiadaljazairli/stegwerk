import { registerEnumType } from '@nestjs/graphql';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

registerEnumType(QuoteStatus, { name: 'QuoteStatus' });

export const TAX_RATES = [0, 7, 19] as const;

export const UNITS = [
  'Stück',
  'Stunde',
  'Tag',
  'Pauschal',
  'Monat',
  'Jahr',
  'km',
  'kg',
  'm',
  'm²',
] as const;

export const DEFAULT_UNIT = 'Stück';
