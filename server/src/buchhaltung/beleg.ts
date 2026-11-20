import { type CompanyEntity } from '../crm/entities/company.entity';
import { type ContactEntity } from '../crm/entities/contact.entity';
import { type InvoiceEntity } from '../invoices/invoice.entity';
import { laenderkennung } from '../invoices/xrechnung';
import { quoteTotals } from '../quotes/quote-totals';
import { type Steuerbefreiung, ustIdNormal } from '../quotes/steuerbefreiung';

export type BelegGruppe = {
  ratePercent: number;
  netCents: number;
  taxCents: number;
};

export type BelegEmpfaenger =
  | {
      art: 'company' | 'contact';
      datensatzId: string;
      firma: string | null;
      vorname: string | null;
      nachname: string | null;
      email: string | null;
      strasse: string | null;
      plz: string | null;
      ort: string | null;
      land: string;
      ustId: string | null;
    }
  | {
      art: 'sammel';
      name: string;
    };

export type BelegDaten = {
  invoiceId: string;
  nummer: string;
  datum: string;
  leistungsdatum: string | null;
  faellig: string | null;
  korrektur: boolean;
  korrigiert: string | null;
  smallBusiness: boolean;
  befreiung: Steuerbefreiung | null;
  gruppen: BelegGruppe[];
  bruttoCents: number;
  steuerCents: number;
  empfaenger: BelegEmpfaenger;
};

const ersteZeile = (anschrift: string | null): string | null => {
  const zeile = (anschrift ?? '')
    .split(/\r?\n/u)
    .map((teil) => teil.trim())
    .find((teil) => teil !== '');

  return zeile === undefined ? null : zeile.slice(0, 200);
};

const leerZuNull = (wert: string | null | undefined): string | null => {
  const text = (wert ?? '').trim();

  return text === '' ? null : text;
};

export const empfaengerVon = (
  invoice: Pick<
    InvoiceEntity,
    'recipientAddress' | 'recipientVatId' | 'number'
  > & {
    company: CompanyEntity | null;
    contact: ContactEntity | null;
  },
): BelegEmpfaenger => {
  const { company, contact } = invoice;

  if (company !== null && company !== undefined) {
    return {
      art: 'company',
      datensatzId: company.id,
      firma: company.name,
      vorname: null,
      nachname: null,
      email: leerZuNull(company.invoiceEmail),
      strasse: leerZuNull(company.street),
      plz: leerZuNull(company.postalCode),
      ort: leerZuNull(company.city),
      land: laenderkennung(company.country),
      ustId: ustIdNormal(invoice.recipientVatId),
    };
  }

  if (contact !== null && contact !== undefined) {
    return {
      art: 'contact',
      datensatzId: contact.id,
      firma: null,
      vorname: leerZuNull(contact.firstName),
      nachname: leerZuNull(contact.lastName) ?? contact.firstName,
      email: leerZuNull(contact.email),
      strasse: leerZuNull(contact.street),
      plz: leerZuNull(contact.postalCode),
      ort: leerZuNull(contact.city),
      land: laenderkennung(contact.country),
      ustId: ustIdNormal(invoice.recipientVatId),
    };
  }

  return {
    art: 'sammel',
    name:
      ersteZeile(invoice.recipientAddress) ??
      `Rechnung ${invoice.number ?? ''}`.trim(),
  };
};

export const anzeigeName = (empfaenger: BelegEmpfaenger): string =>
  empfaenger.art === 'sammel'
    ? empfaenger.name
    : (empfaenger.firma ??
      [empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(' '));

export class KeinBeleg extends Error {}

export const belegDaten = (
  invoice: InvoiceEntity,
  korrigiertNummer: string | null,
): BelegDaten => {
  if (invoice.number === null || invoice.issuedAt === null) {
    throw new KeinBeleg(
      'Nur eine gestellte Rechnung geht in die Buchhaltung; ein Entwurf hat noch keine Nummer.',
    );
  }

  const summen = quoteTotals(
    (invoice.lines ?? []).map((line) => ({
      quantity: Number(line.quantity),
      unitPriceCents: line.unitPriceCents,
      discountPercent: Number(line.discountPercent),
      taxRatePercent: line.taxRatePercent,
    })),
    invoice.smallBusiness,
  );

  if (summen.grossCents === 0) {
    throw new KeinBeleg(
      'Eine Rechnung über 0,00 € trägt nichts in die Buchhaltung und wird nicht übertragen.',
    );
  }

  return {
    invoiceId: invoice.id,
    nummer: invoice.number,
    datum: invoice.issuedOn,
    leistungsdatum: invoice.serviceDate,
    faellig: invoice.dueOn,
    korrektur: invoice.correctsInvoiceId !== null,
    korrigiert: korrigiertNummer,
    smallBusiness: invoice.smallBusiness,
    befreiung: invoice.taxExemption,
    gruppen: summen.taxGroups.filter(
      (gruppe) => gruppe.netCents !== 0 || gruppe.taxCents !== 0,
    ),
    bruttoCents: summen.grossCents,
    steuerCents: summen.taxCents,
    empfaenger: empfaengerVon(invoice),
  };
};

export const euro = (cent: number): number => Math.round(cent) / 100;

export const bemerkung = (daten: BelegDaten): string =>
  daten.korrektur
    ? `Rechnungskorrektur ${daten.nummer}${daten.korrigiert === null ? '' : ` zur Rechnung ${daten.korrigiert}`}, aus Stegwerk übertragen.`
    : `Rechnung ${daten.nummer}, aus Stegwerk übertragen.`;
