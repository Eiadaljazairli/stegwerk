import {
  befreiungsLuecken,
  type Steuerbefreiung,
} from '../quotes/steuerbefreiung';
import { InvoiceStatus } from './invoice.types';

export const mayEdit = (status: InvoiceStatus): boolean =>
  status === InvoiceStatus.DRAFT;

export const mayIssue = (status: InvoiceStatus): boolean =>
  status === InvoiceStatus.DRAFT;

export const mayDelete = (status: InvoiceStatus): boolean =>
  status === InvoiceStatus.DRAFT;

export const mayCancel = (
  status: InvoiceStatus,
  isCorrection: boolean,
): boolean => {
  if (isCorrection) {
    return false;
  }

  return status === InvoiceStatus.ISSUED || status === InvoiceStatus.PAID;
};

export const mayMarkPaid = (status: InvoiceStatus): boolean =>
  status === InvoiceStatus.ISSUED;

export const statusAfterIssue = (grossCents: number): InvoiceStatus =>
  grossCents === 0 ? InvoiceStatus.PAID : InvoiceStatus.ISSUED;

export type GapField = { field: string; label: string };

export type InvoiceSubject = {
  recipientAddress: string | null;
  serviceDate: string | null;
  lineCount: number;
  smallBusiness?: boolean;
  taxExemption?: Steuerbefreiung | null;
  taxExemptionNote?: string | null;
  recipientVatId?: string | null;
  taxRates?: number[];
};

export type IssuerDetails = {
  companyName: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  taxNumber: string | null;
  vatId: string | null;
};

export const anschriftUnvollstaendig = (anschrift: string | null): boolean => {
  const zeilen = (anschrift ?? '')
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== '');

  return (
    zeilen.length < 2 || !zeilen.slice(1).some((zeile) => /[0-9]/.test(zeile))
  );
};

export const invoiceGaps = (
  issuer: IssuerDetails,
  invoice: InvoiceSubject,
): GapField[] => {
  const gaps: GapField[] = [];

  const missing = (value: string | null): boolean =>
    value === null || value.trim() === '';

  if (missing(issuer.companyName)) {
    gaps.push({ field: 'companyName', label: 'Ihr Firmenname' });
  }

  if (
    missing(issuer.street) ||
    missing(issuer.postalCode) ||
    missing(issuer.city)
  ) {
    gaps.push({ field: 'address', label: 'Ihre vollständige Anschrift' });
  }

  if (missing(issuer.taxNumber) && missing(issuer.vatId)) {
    gaps.push({
      field: 'taxNumber',
      label: 'Ihre Steuernummer oder USt-IdNr.',
    });
  }

  if (anschriftUnvollstaendig(invoice.recipientAddress)) {
    gaps.push({
      field: 'recipientAddress',
      label: 'Die vollständige Anschrift des Empfängers mit Straße und PLZ',
    });
  }

  if (missing(invoice.serviceDate)) {
    gaps.push({ field: 'serviceDate', label: 'Das Leistungsdatum' });
  }

  if (invoice.lineCount === 0) {
    gaps.push({ field: 'lines', label: 'Mindestens eine Position' });
  }

  gaps.push(
    ...befreiungsLuecken({
      smallBusiness: invoice.smallBusiness ?? false,
      taxExemption: invoice.taxExemption ?? null,
      taxExemptionNote: invoice.taxExemptionNote ?? null,
      recipientVatId: invoice.recipientVatId ?? null,
      raten: invoice.taxRates ?? [],
      eigeneUstId: issuer.vatId,
    }),
  );

  return gaps;
};
