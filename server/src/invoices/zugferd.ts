import { lineNetCents } from '../quotes/quote-totals';
import { ustIdNormal } from '../quotes/steuerbefreiung';
import {
  befreiungsNotizen,
  betrag,
  einheitencode,
  escapeXml,
  kategorie,
  laenderkennung,
  menge,
  type XRechnungInput,
  type XRechnungLuecke,
  type XRechnungParty,
  type XRechnungSeller,
} from './xrechnung';

export const FACTURX_EN16931 = 'urn:cen.eu:en16931:2017';

export const FACTURX_DATEINAME = 'factur-x.xml';

const PEPPOL_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const leer = (wert: string | null | undefined): boolean =>
  (wert ?? '').trim() === '';

export const zugferdLuecken = (
  input: Pick<XRechnungInput, 'seller' | 'buyer'>,
): XRechnungLuecke[] => {
  const luecken: XRechnungLuecke[] = [];

  if (leer(input.seller.name))
    luecken.push({ wo: 'Briefkopf', was: 'Firmenname' });
  if (leer(input.seller.vatId) && leer(input.seller.taxNumber))
    luecken.push({ wo: 'Briefkopf', was: 'USt-IdNr. oder Steuernummer' });
  if (leer(input.buyer.name)) luecken.push({ wo: 'Empfänger', was: 'Name' });

  return luecken;
};

const tag = (
  name: string,
  wert: string | null | undefined,
  attribute = '',
): string =>
  wert === null || wert === undefined || wert.trim() === ''
    ? ''
    : `<${name}${attribute}>${escapeXml(wert.trim())}</${name}>`;

const datum = (name: string, iso: string | null): string =>
  iso === null
    ? ''
    : `<${name}><udt:DateTimeString format="102">${iso.slice(0, 10).replace(/-/gu, '')}</udt:DateTimeString></${name}>`;

const anschrift = (partei: XRechnungParty): string =>
  [
    '<ram:PostalTradeAddress>',
    tag('ram:PostcodeCode', partei.postalCode),
    tag('ram:LineOne', partei.street),
    tag('ram:CityName', partei.city),
    tag('ram:CountryID', laenderkennung(partei.country)),
    '</ram:PostalTradeAddress>',
  ].join('');

const elektronischeAdresse = (email: string | null): string =>
  leer(email)
    ? ''
    : `<ram:URIUniversalCommunication>${tag('ram:URIID', email, ' schemeID="EM"')}</ram:URIUniversalCommunication>`;

const verkaeufer = (seller: XRechnungSeller): string => {
  const kontakt = seller.contactName ?? seller.name;
  const mitKontakt =
    !leer(seller.phone) || !leer(seller.email) || !leer(seller.contactName);

  return [
    '<ram:SellerTradeParty>',
    leer(seller.vatId) && leer(seller.registerEntry) && !leer(seller.taxNumber)
      ? tag('ram:ID', seller.taxNumber)
      : '',
    tag('ram:Name', seller.name),
    leer(seller.registerEntry)
      ? ''
      : `<ram:SpecifiedLegalOrganization>${tag('ram:ID', seller.registerEntry)}</ram:SpecifiedLegalOrganization>`,
    mitKontakt
      ? [
          '<ram:DefinedTradeContact>',
          tag('ram:PersonName', kontakt),
          leer(seller.phone)
            ? ''
            : `<ram:TelephoneUniversalCommunication>${tag('ram:CompleteNumber', seller.phone)}</ram:TelephoneUniversalCommunication>`,
          leer(seller.email)
            ? ''
            : `<ram:EmailURIUniversalCommunication>${tag('ram:URIID', seller.email)}</ram:EmailURIUniversalCommunication>`,
          '</ram:DefinedTradeContact>',
        ].join('')
      : '',
    anschrift(seller),
    elektronischeAdresse(seller.email),
    leer(seller.vatId)
      ? ''
      : `<ram:SpecifiedTaxRegistration>${tag('ram:ID', seller.vatId?.replace(/\s/gu, ''), ' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`,
    leer(seller.taxNumber)
      ? ''
      : `<ram:SpecifiedTaxRegistration>${tag('ram:ID', seller.taxNumber, ' schemeID="FC"')}</ram:SpecifiedTaxRegistration>`,
    '</ram:SellerTradeParty>',
  ].join('');
};

const kaeufer = (buyer: XRechnungParty, ustId: string | null): string =>
  [
    '<ram:BuyerTradeParty>',
    tag('ram:Name', buyer.name),
    anschrift(buyer),
    elektronischeAdresse(buyer.email),
    ustId === null
      ? ''
      : `<ram:SpecifiedTaxRegistration>${tag('ram:ID', ustId, ' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`,
    '</ram:BuyerTradeParty>',
  ].join('');

const position = (
  line: XRechnungInput['lines'][number],
  index: number,
  input: XRechnungInput,
): string => {
  const netto = lineNetCents(line);
  const brutto =
    Math.sign(line.quantity * line.unitPriceCents) *
    Math.round(Math.abs(line.quantity * line.unitPriceCents));
  const abschlag = brutto - netto;
  const steuer = kategorie(
    line.taxRatePercent,
    input.smallBusiness,
    input.befreiung ?? null,
  );

  return [
    '<ram:IncludedSupplyChainTradeLineItem>',
    '<ram:AssociatedDocumentLineDocument>',
    tag('ram:LineID', String(index + 1)),
    '</ram:AssociatedDocumentLineDocument>',
    '<ram:SpecifiedTradeProduct>',
    tag('ram:SellerAssignedID', line.articleNumber),
    tag('ram:Name', line.name),
    tag('ram:Description', line.description),
    '</ram:SpecifiedTradeProduct>',
    '<ram:SpecifiedLineTradeAgreement>',
    '<ram:NetPriceProductTradePrice>',
    tag('ram:ChargeAmount', betrag(line.unitPriceCents)),
    '</ram:NetPriceProductTradePrice>',
    '</ram:SpecifiedLineTradeAgreement>',
    '<ram:SpecifiedLineTradeDelivery>',
    `<ram:BilledQuantity unitCode="${einheitencode(line.unit)}">${menge(line.quantity)}</ram:BilledQuantity>`,
    '</ram:SpecifiedLineTradeDelivery>',
    '<ram:SpecifiedLineTradeSettlement>',
    '<ram:ApplicableTradeTax>',
    '<ram:TypeCode>VAT</ram:TypeCode>',
    tag('ram:CategoryCode', steuer.id),
    tag(
      'ram:RateApplicablePercent',
      String(input.smallBusiness ? 0 : line.taxRatePercent),
    ),
    '</ram:ApplicableTradeTax>',
    abschlag === 0
      ? ''
      : [
          '<ram:SpecifiedTradeAllowanceCharge>',
          '<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>',
          tag('ram:ActualAmount', betrag(abschlag)),
          tag('ram:ReasonCode', '95'),
          tag('ram:Reason', `Rabatt ${String(line.discountPercent)} %`),
          '</ram:SpecifiedTradeAllowanceCharge>',
        ].join(''),
    '<ram:SpecifiedTradeSettlementLineMonetarySummation>',
    tag('ram:LineTotalAmount', betrag(netto)),
    '</ram:SpecifiedTradeSettlementLineMonetarySummation>',
    '</ram:SpecifiedLineTradeSettlement>',
    '</ram:IncludedSupplyChainTradeLineItem>',
  ].join('');
};

const lieferung = (input: XRechnungInput, innergemeinschaftlich: boolean) =>
  [
    '<ram:ApplicableHeaderTradeDelivery>',
    innergemeinschaftlich
      ? `<ram:ShipToTradeParty>${tag('ram:Name', input.buyer.name)}${anschrift(input.buyer)}</ram:ShipToTradeParty>`
      : '',
    input.serviceDate === null
      ? ''
      : `<ram:ActualDeliverySupplyChainEvent>${datum('ram:OccurrenceDateTime', input.serviceDate)}</ram:ActualDeliverySupplyChainEvent>`,
    '</ram:ApplicableHeaderTradeDelivery>',
  ].join('');

const zahlung = (seller: XRechnungSeller): string => {
  if (leer(seller.iban)) {
    return '';
  }

  return [
    '<ram:SpecifiedTradeSettlementPaymentMeans>',
    '<ram:TypeCode>58</ram:TypeCode>',
    '<ram:PayeePartyCreditorFinancialAccount>',
    tag('ram:IBANID', seller.iban?.replace(/\s/gu, '').toUpperCase()),
    tag('ram:AccountName', seller.name),
    '</ram:PayeePartyCreditorFinancialAccount>',
    leer(seller.bic)
      ? ''
      : `<ram:PayeeSpecifiedCreditorFinancialInstitution>${tag('ram:BICID', seller.bic?.replace(/\s/gu, '').toUpperCase())}</ram:PayeeSpecifiedCreditorFinancialInstitution>`,
    '</ram:SpecifiedTradeSettlementPaymentMeans>',
  ].join('');
};

export const renderFacturX = (
  input: XRechnungInput,
  guideline: string = FACTURX_EN16931,
): string => {
  const { totals, seller } = input;
  const befreiung = input.befreiung ?? null;
  const steuern = totals.taxGroups.map((gruppe) => ({
    gruppe,
    steuer: kategorie(gruppe.ratePercent, input.smallBusiness, befreiung),
  }));
  const innergemeinschaftlich = steuern.some(({ steuer }) => steuer.id === 'K');

  const steuerTeile = steuern
    .map(({ gruppe, steuer }) =>
      [
        '<ram:ApplicableTradeTax>',
        tag('ram:CalculatedAmount', betrag(gruppe.taxCents)),
        '<ram:TypeCode>VAT</ram:TypeCode>',
        tag('ram:ExemptionReason', steuer.grund),
        tag('ram:BasisAmount', betrag(gruppe.netCents)),
        tag('ram:CategoryCode', steuer.id),
        tag('ram:ExemptionReasonCode', steuer.code),
        tag('ram:RateApplicablePercent', String(gruppe.ratePercent)),
        '</ram:ApplicableTradeTax>',
      ].join(''),
    )
    .join('');

  const zahlungsbedingung =
    input.dueOn === null
      ? ''
      : [
          '<ram:SpecifiedTradePaymentTerms>',
          tag('ram:Description', `Zahlbar bis ${input.dueOn}.`),
          datum('ram:DueDateDateTime', input.dueOn),
          '</ram:SpecifiedTradePaymentTerms>',
        ].join('');

  const notizen = [...input.notes, ...befreiungsNotizen(input)];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
    ' xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
    ' xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
    ' xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
    '<rsm:ExchangedDocumentContext>',
    `<ram:BusinessProcessSpecifiedDocumentContextParameter>${tag('ram:ID', PEPPOL_PROFILE)}</ram:BusinessProcessSpecifiedDocumentContextParameter>`,
    `<ram:GuidelineSpecifiedDocumentContextParameter>${tag('ram:ID', guideline)}</ram:GuidelineSpecifiedDocumentContextParameter>`,
    '</rsm:ExchangedDocumentContext>',
    '<rsm:ExchangedDocument>',
    tag('ram:ID', input.number),
    tag('ram:TypeCode', input.correctsNumber === null ? '380' : '384'),
    datum('ram:IssueDateTime', input.issuedOn),
    ...notizen.map(
      (notiz) =>
        `<ram:IncludedNote>${tag('ram:Content', notiz)}</ram:IncludedNote>`,
    ),
    '</rsm:ExchangedDocument>',
    '<rsm:SupplyChainTradeTransaction>',
    ...input.lines.map((line, index) => position(line, index, input)),
    '<ram:ApplicableHeaderTradeAgreement>',
    tag('ram:BuyerReference', input.buyerReference ?? input.number),
    verkaeufer(seller),
    kaeufer(
      input.buyer,
      input.smallBusiness
        ? null
        : ustIdNormal(befreiung?.recipientVatId ?? null),
    ),
    '</ram:ApplicableHeaderTradeAgreement>',
    lieferung(input, innergemeinschaftlich),
    '<ram:ApplicableHeaderTradeSettlement>',
    tag('ram:PaymentReference', input.number),
    tag('ram:InvoiceCurrencyCode', input.currency),
    zahlung(seller),
    steuerTeile,
    zahlungsbedingung,
    '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    tag('ram:LineTotalAmount', betrag(totals.netCents)),
    tag('ram:TaxBasisTotalAmount', betrag(totals.netCents)),
    tag(
      'ram:TaxTotalAmount',
      betrag(totals.taxCents),
      ` currencyID="${input.currency}"`,
    ),
    tag('ram:GrandTotalAmount', betrag(totals.grossCents)),
    tag('ram:DuePayableAmount', betrag(totals.grossCents)),
    '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    input.correctsNumber === null
      ? ''
      : `<ram:InvoiceReferencedDocument>${tag('ram:IssuerAssignedID', input.correctsNumber)}</ram:InvoiceReferencedDocument>`,
    '</ram:ApplicableHeaderTradeSettlement>',
    '</rsm:SupplyChainTradeTransaction>',
    '</rsm:CrossIndustryInvoice>',
    '',
  ].join('\n');
};
