import { lineNetCents, type QuoteTotals } from '../quotes/quote-totals';
import {
  BEFREIUNGEN,
  befreiungsHinweise,
  type Befreiungsfelder,
  ustIdNormal,
} from '../quotes/steuerbefreiung';

export const XRECHNUNG_CUSTOMIZATION =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

const PEPPOL_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export type XRechnungParty = {
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
};

export type XRechnungSeller = XRechnungParty & {
  phone: string | null;
  contactName: string | null;
  vatId: string | null;
  taxNumber: string | null;
  registerEntry: string | null;
  iban: string | null;
  bic: string | null;
  bankName: string | null;
};

export type XRechnungLine = {
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
};

export type XRechnungInput = {
  number: string;
  issuedOn: string;
  dueOn: string | null;
  serviceDate: string | null;
  buyerReference: string | null;
  correctsNumber: string | null;
  smallBusiness: boolean;
  befreiung?: Befreiungsfelder | null;
  currency: string;
  notes: string[];
  seller: XRechnungSeller;
  buyer: XRechnungParty;
  lines: XRechnungLine[];
  totals: QuoteTotals;
};

export type XRechnungLuecke = {
  wo: string;
  was: string;
};

export const xrechnungLuecken = (
  input: Pick<XRechnungInput, 'seller' | 'buyer'>,
): XRechnungLuecke[] => {
  const luecken: XRechnungLuecke[] = [];
  const leer = (wert: string | null): boolean => (wert ?? '').trim() === '';
  const { seller, buyer } = input;

  if (leer(seller.name)) luecken.push({ wo: 'Briefkopf', was: 'Firmenname' });
  if (leer(seller.street)) luecken.push({ wo: 'Briefkopf', was: 'Straße' });
  if (leer(seller.postalCode))
    luecken.push({ wo: 'Briefkopf', was: 'Postleitzahl' });
  if (leer(seller.city)) luecken.push({ wo: 'Briefkopf', was: 'Ort' });
  if (leer(seller.email)) luecken.push({ wo: 'Briefkopf', was: 'E-Mail' });
  if (leer(seller.phone)) luecken.push({ wo: 'Briefkopf', was: 'Telefon' });
  if (leer(seller.vatId) && leer(seller.taxNumber))
    luecken.push({ wo: 'Briefkopf', was: 'USt-IdNr. oder Steuernummer' });
  if (leer(seller.iban)) luecken.push({ wo: 'Briefkopf', was: 'IBAN' });

  if (leer(buyer.name)) luecken.push({ wo: 'Empfänger', was: 'Name' });
  if (leer(buyer.postalCode))
    luecken.push({ wo: 'Empfänger', was: 'Postleitzahl' });
  if (leer(buyer.city)) luecken.push({ wo: 'Empfänger', was: 'Ort' });
  if (leer(buyer.email)) luecken.push({ wo: 'Firma', was: 'Rechnungs-E-Mail' });

  return luecken;
};

const LAENDER: Record<string, string> = {
  deutschland: 'DE',
  germany: 'DE',
  österreich: 'AT',
  oesterreich: 'AT',
  austria: 'AT',
  schweiz: 'CH',
  switzerland: 'CH',
  niederlande: 'NL',
  frankreich: 'FR',
  belgien: 'BE',
  luxemburg: 'LU',
  italien: 'IT',
  spanien: 'ES',
  polen: 'PL',
  dänemark: 'DK',
  tschechien: 'CZ',
};

export const laenderkennung = (land: string | null): string => {
  const wert = (land ?? '').trim();

  if (wert === '') {
    return 'DE';
  }

  if (/^[A-Za-z]{2}$/u.test(wert)) {
    return wert.toUpperCase();
  }

  return LAENDER[wert.toLowerCase()] ?? 'DE';
};

const EINHEITEN: Record<string, string> = {
  Stück: 'H87',
  Stunde: 'HUR',
  Tag: 'DAY',
  Pauschal: 'LS',
  Monat: 'MON',
  Jahr: 'ANN',
  km: 'KMT',
  kg: 'KGM',
  m: 'MTR',
  'm²': 'MTK',
};

export const einheitencode = (einheit: string): string =>
  EINHEITEN[einheit] ?? 'C62';

export const escapeXml = (wert: string): string =>
  wert
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '');

export const betrag = (cent: number): string => {
  const vorzeichen = cent < 0 ? '-' : '';
  const abs = Math.abs(cent);
  const euro = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');

  return `${vorzeichen}${String(euro)}.${rest}`;
};

export const menge = (wert: number): string => {
  const gerundet = Math.round(wert * 1000) / 1000;

  return String(gerundet);
};

export const kategorie = (
  ratePercent: number,
  smallBusiness: boolean,
  befreiung: Befreiungsfelder | null = null,
): { id: string; code: string | null; grund: string | null } => {
  if (smallBusiness) {
    return {
      id: 'E',
      code: null,
      grund:
        'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG',
    };
  }

  if (ratePercent !== 0) {
    return { id: 'S', code: null, grund: null };
  }

  if (befreiung === null || befreiung.taxExemption == null) {
    return { id: 'Z', code: null, grund: null };
  }

  const angaben = BEFREIUNGEN[befreiung.taxExemption];

  if (angaben.kategorie === 'Z') {
    return { id: 'Z', code: null, grund: null };
  }

  return {
    id: angaben.kategorie,
    code: angaben.vatex,
    grund: angaben.hinweis(befreiung.taxExemptionNote),
  };
};

const tag = (
  name: string,
  wert: string | null | undefined,
  attribute = '',
): string =>
  wert === null || wert === undefined || wert.trim() === ''
    ? ''
    : `<${name}${attribute}>${escapeXml(wert.trim())}</${name}>`;

const anschrift = (partei: XRechnungParty): string =>
  [
    '<cac:PostalAddress>',
    tag('cbc:StreetName', partei.street),
    tag('cbc:CityName', partei.city),
    tag('cbc:PostalZone', partei.postalCode),
    '<cac:Country>',
    tag('cbc:IdentificationCode', laenderkennung(partei.country)),
    '</cac:Country>',
    '</cac:PostalAddress>',
  ].join('');

const leer = (wert: string | null): boolean => (wert ?? '').trim() === '';

const verkaeufer = (seller: XRechnungSeller): string =>
  [
    '<cac:AccountingSupplierParty><cac:Party>',
    tag('cbc:EndpointID', seller.email, ' schemeID="EM"'),
    leer(seller.vatId) && leer(seller.registerEntry) && !leer(seller.taxNumber)
      ? `<cac:PartyIdentification>${tag('cbc:ID', seller.taxNumber)}</cac:PartyIdentification>`
      : '',
    '<cac:PartyName>',
    tag('cbc:Name', seller.name),
    '</cac:PartyName>',
    anschrift(seller),
    (seller.vatId ?? '').trim() === ''
      ? ''
      : `<cac:PartyTaxScheme>${tag('cbc:CompanyID', seller.vatId?.replace(/\s/gu, ''))}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
    (seller.taxNumber ?? '').trim() === ''
      ? ''
      : `<cac:PartyTaxScheme>${tag('cbc:CompanyID', seller.taxNumber)}<cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
    '<cac:PartyLegalEntity>',
    tag('cbc:RegistrationName', seller.name),
    tag('cbc:CompanyID', seller.registerEntry),
    '</cac:PartyLegalEntity>',
    '<cac:Contact>',
    tag('cbc:Name', seller.contactName ?? seller.name),
    tag('cbc:Telephone', seller.phone),
    tag('cbc:ElectronicMail', seller.email),
    '</cac:Contact>',
    '</cac:Party></cac:AccountingSupplierParty>',
  ].join('');

const kaeufer = (buyer: XRechnungParty, ustId: string | null): string =>
  [
    '<cac:AccountingCustomerParty><cac:Party>',
    tag('cbc:EndpointID', buyer.email, ' schemeID="EM"'),
    '<cac:PartyName>',
    tag('cbc:Name', buyer.name),
    '</cac:PartyName>',
    anschrift(buyer),
    ustId === null
      ? ''
      : `<cac:PartyTaxScheme>${tag('cbc:CompanyID', ustId)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
    '<cac:PartyLegalEntity>',
    tag('cbc:RegistrationName', buyer.name),
    '</cac:PartyLegalEntity>',
    '</cac:Party></cac:AccountingCustomerParty>',
  ].join('');

const zeile = (
  line: XRechnungLine,
  index: number,
  smallBusiness: boolean,
  currency: string,
  befreiung: Befreiungsfelder | null,
): string => {
  const waehrung = ` currencyID="${currency}"`;
  const netto = lineNetCents(line);

  const brutto =
    Math.sign(line.quantity * line.unitPriceCents) *
    Math.round(Math.abs(line.quantity * line.unitPriceCents));
  const abschlag = brutto - netto;
  const steuer = kategorie(line.taxRatePercent, smallBusiness, befreiung);

  return [
    '<cac:InvoiceLine>',
    tag('cbc:ID', String(index + 1)),
    `<cbc:InvoicedQuantity unitCode="${einheitencode(line.unit)}">${menge(line.quantity)}</cbc:InvoicedQuantity>`,
    `<cbc:LineExtensionAmount${waehrung}>${betrag(netto)}</cbc:LineExtensionAmount>`,
    abschlag === 0
      ? ''
      : `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode><cbc:AllowanceChargeReason>Rabatt ${escapeXml(String(line.discountPercent))} %</cbc:AllowanceChargeReason><cbc:Amount${waehrung}>${betrag(abschlag)}</cbc:Amount></cac:AllowanceCharge>`,
    '<cac:Item>',
    tag('cbc:Description', line.description),
    tag('cbc:Name', line.name),
    (line.articleNumber ?? '').trim() === ''
      ? ''
      : `<cac:SellersItemIdentification>${tag('cbc:ID', line.articleNumber)}</cac:SellersItemIdentification>`,
    '<cac:ClassifiedTaxCategory>',
    tag('cbc:ID', steuer.id),
    `<cbc:Percent>${String(smallBusiness ? 0 : line.taxRatePercent)}</cbc:Percent>`,
    '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>',
    '</cac:ClassifiedTaxCategory>',
    '</cac:Item>',
    '<cac:Price>',
    `<cbc:PriceAmount${waehrung}>${betrag(line.unitPriceCents)}</cbc:PriceAmount>`,
    '</cac:Price>',
    '</cac:InvoiceLine>',
  ].join('');
};

const lieferung = (
  datum: string | null,
  empfaenger: XRechnungParty,
  innergemeinschaftlich: boolean,
): string => {
  if (datum === null && !innergemeinschaftlich) {
    return '';
  }

  return [
    '<cac:Delivery>',
    tag('cbc:ActualDeliveryDate', datum),
    innergemeinschaftlich
      ? [
          '<cac:DeliveryLocation><cac:Address>',
          tag('cbc:StreetName', empfaenger.street),
          tag('cbc:CityName', empfaenger.city),
          tag('cbc:PostalZone', empfaenger.postalCode),
          '<cac:Country>',
          tag('cbc:IdentificationCode', laenderkennung(empfaenger.country)),
          '</cac:Country>',
          '</cac:Address></cac:DeliveryLocation>',
        ].join('')
      : '',
    '</cac:Delivery>',
  ].join('');
};

export const befreiungsNotizen = (input: XRechnungInput): string[] =>
  input.befreiung == null
    ? []
    : befreiungsHinweise({
        ...input.befreiung,
        smallBusiness: input.smallBusiness,
      });

export const renderXRechnung = (input: XRechnungInput): string => {
  const currency = input.currency;
  const waehrung = ` currencyID="${currency}"`;
  const { totals, seller } = input;
  const befreiung = input.befreiung ?? null;
  const kategorien = totals.taxGroups.map(
    (gruppe) =>
      kategorie(gruppe.ratePercent, input.smallBusiness, befreiung).id,
  );

  const steuerTeile = totals.taxGroups
    .map((gruppe) => {
      const steuer = kategorie(
        gruppe.ratePercent,
        input.smallBusiness,
        befreiung,
      );

      return [
        '<cac:TaxSubtotal>',
        `<cbc:TaxableAmount${waehrung}>${betrag(gruppe.netCents)}</cbc:TaxableAmount>`,
        `<cbc:TaxAmount${waehrung}>${betrag(gruppe.taxCents)}</cbc:TaxAmount>`,
        '<cac:TaxCategory>',
        tag('cbc:ID', steuer.id),
        `<cbc:Percent>${String(gruppe.ratePercent)}</cbc:Percent>`,
        tag('cbc:TaxExemptionReasonCode', steuer.code),
        tag('cbc:TaxExemptionReason', steuer.grund),
        '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>',
        '</cac:TaxCategory>',
        '</cac:TaxSubtotal>',
      ].join('');
    })
    .join('');

  const zahlungsbedingung =
    input.dueOn === null ? null : `Zahlbar bis ${input.dueOn}.`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    tag('cbc:CustomizationID', XRECHNUNG_CUSTOMIZATION),
    tag('cbc:ProfileID', PEPPOL_PROFILE),
    tag('cbc:ID', input.number),
    tag('cbc:IssueDate', input.issuedOn),
    tag('cbc:DueDate', input.dueOn),
    tag('cbc:InvoiceTypeCode', input.correctsNumber === null ? '380' : '384'),
    ...[...input.notes, ...befreiungsNotizen(input)].map((notiz) =>
      tag('cbc:Note', notiz),
    ),
    tag('cbc:DocumentCurrencyCode', currency),
    tag('cbc:BuyerReference', input.buyerReference ?? input.number),
    input.correctsNumber === null
      ? ''
      : `<cac:BillingReference><cac:InvoiceDocumentReference>${tag('cbc:ID', input.correctsNumber)}</cac:InvoiceDocumentReference></cac:BillingReference>`,
    verkaeufer(seller),
    kaeufer(
      input.buyer,
      input.smallBusiness
        ? null
        : ustIdNormal(befreiung?.recipientVatId ?? null),
    ),
    lieferung(input.serviceDate, input.buyer, kategorien.includes('K')),
    '<cac:PaymentMeans>',
    '<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>',
    tag('cbc:PaymentID', input.number),
    '<cac:PayeeFinancialAccount>',
    tag('cbc:ID', seller.iban?.replace(/\s/gu, '').toUpperCase()),
    tag('cbc:Name', seller.name),
    (seller.bic ?? '').trim() === ''
      ? ''
      : `<cac:FinancialInstitutionBranch>${tag('cbc:ID', seller.bic?.replace(/\s/gu, '').toUpperCase())}</cac:FinancialInstitutionBranch>`,
    '</cac:PayeeFinancialAccount>',
    '</cac:PaymentMeans>',
    zahlungsbedingung === null
      ? ''
      : `<cac:PaymentTerms>${tag('cbc:Note', zahlungsbedingung)}</cac:PaymentTerms>`,
    '<cac:TaxTotal>',
    `<cbc:TaxAmount${waehrung}>${betrag(totals.taxCents)}</cbc:TaxAmount>`,
    steuerTeile,
    '</cac:TaxTotal>',
    '<cac:LegalMonetaryTotal>',
    `<cbc:LineExtensionAmount${waehrung}>${betrag(totals.netCents)}</cbc:LineExtensionAmount>`,
    `<cbc:TaxExclusiveAmount${waehrung}>${betrag(totals.netCents)}</cbc:TaxExclusiveAmount>`,
    `<cbc:TaxInclusiveAmount${waehrung}>${betrag(totals.grossCents)}</cbc:TaxInclusiveAmount>`,
    `<cbc:PayableAmount${waehrung}>${betrag(totals.grossCents)}</cbc:PayableAmount>`,
    '</cac:LegalMonetaryTotal>',
    ...input.lines.map((line, index) =>
      zeile(line, index, input.smallBusiness, currency, befreiung),
    ),
    '</ubl:Invoice>',
    '',
  ].join('\n');
};

export const empfaengerAusAnschrift = (
  anschriftfeld: string | null,
  firma: Omit<XRechnungParty, 'email'> | null,
): Omit<XRechnungParty, 'email'> => {
  const zeilen = (anschriftfeld ?? '')
    .split(/\r?\n/u)
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '');

  let land: string | null = null;
  const ortIndex = zeilen.findIndex((teil) => /^\d{4,5}\s+\S/u.test(teil));

  if (ortIndex === -1) {
    return {
      name: zeilen[0] ?? firma?.name ?? null,
      street: firma?.street ?? null,
      postalCode: firma?.postalCode ?? null,
      city: firma?.city ?? null,
      country: firma?.country ?? null,
    };
  }

  if (ortIndex < zeilen.length - 1) {
    land = zeilen[ortIndex + 1] ?? null;
  }

  const ortZeile = zeilen[ortIndex] ?? '';
  const [, plz, ort] = /^(\d{4,5})\s+(.+)$/u.exec(ortZeile) ?? [];
  const strasse = ortIndex >= 2 ? (zeilen[ortIndex - 1] ?? null) : null;

  return {
    name: zeilen[0] ?? firma?.name ?? null,
    street: strasse ?? firma?.street ?? null,
    postalCode: plz ?? null,
    city: ort ?? null,
    country: land ?? firma?.country ?? null,
  };
};
