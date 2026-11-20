import { registerEnumType } from '@nestjs/graphql';

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

registerEnumType(InvoiceStatus, { name: 'InvoiceStatus' });

export const CORRECTION_TITLE = 'Rechnungskorrektur';

export const PAYMENT_TERM_DAYS = [7, 14, 30, 60] as const;

export const DEFAULT_PAYMENT_TERM_DAYS = 14;

export const DEFAULT_INVOICE_INTRO =
  'wie besprochen stellen wir Ihnen die folgenden Leistungen in Rechnung:';
