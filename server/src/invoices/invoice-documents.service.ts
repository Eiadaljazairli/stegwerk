import { BadRequestException, Injectable } from '@nestjs/common';
import { befreiungVon } from '../quotes/steuerbefreiung';

import { LetterheadsService } from '../quotes/letterheads.service';
import { briefkopfFuer } from './absender';
import { quoteTotals } from '../quotes/quote-totals';
import { renderInvoicePdf } from './invoice-pdf';
import {
  alsWindows1252,
  datevBuchungsstapel,
  datevLuecken,
  type Kontenrahmen,
} from './datev';
import { type InvoiceEntity } from './invoice.entity';
import { InvoicesService } from './invoices.service';
import {
  empfaengerAusAnschrift,
  renderXRechnung,
  type XRechnungInput,
  type XRechnungLuecke,
  xrechnungLuecken,
} from './xrechnung';
import { type ERechnungAnhang, istCmykJpeg } from '../documents/pdfa';
import { FACTURX_DATEINAME, renderFacturX, zugferdLuecken } from './zugferd';

@Injectable()
export class InvoiceDocumentsService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly letterheads: LetterheadsService,
  ) {}

  fileName(number: string, isCorrection: boolean): string {
    const stem = isCorrection ? 'Rechnungskorrektur' : 'Rechnung';

    return `${stem}-${number.replace(/[^\w.-]/gu, '-')}.pdf`;
  }

  async pdf(
    workspaceId: string,
    id: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    const invoice = await this.invoices.findOne(workspaceId, id);
    const letterhead = briefkopfFuer(
      await this.letterheads.get(workspaceId),
      invoice.issuerSnapshot,
    );

    const number = invoice.number ?? 'ENTWURF';

    const correction =
      invoice.correctsInvoiceId === null
        ? null
        : await this.invoices
            .findOne(workspaceId, invoice.correctsInvoiceId)
            .then((original) => original.number)
            .catch(() => null);

    const lines = invoice.lines.map((line) => ({
      position: line.position,
      name: line.name,
      articleNumber: line.articleNumber,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      discountPercent: Number(line.discountPercent),
      taxRatePercent: line.taxRatePercent,
    }));

    const content = await renderInvoicePdf({
      number,
      issuedOn: invoice.issuedOn,
      serviceDate: invoice.serviceDate,
      dueOn: invoice.dueOn,
      recipientAddress: invoice.recipientAddress,
      introText: invoice.introText,
      closingText: invoice.closingText,
      smallBusiness: invoice.smallBusiness,
      befreiung: befreiungVon(invoice),
      contactName:
        invoice.contact === null
          ? null
          : `${invoice.contact.firstName} ${invoice.contact.lastName}`.trim(),
      correctsNumber: correction,
      offen:
        invoice.number !== null &&
        invoice.paidAt === null &&
        invoice.cancelledAt === null,
      lines,
      totals: quoteTotals(lines, invoice.smallBusiness),
      letterhead,
      eRechnung: await this.zugferdAnhang(workspaceId, invoice),
    });

    return {
      fileName: this.fileName(number, invoice.correctsInvoiceId !== null),
      content,
    };
  }

  async xrechnungLuecken(
    workspaceId: string,
    invoice: InvoiceEntity,
  ): Promise<XRechnungLuecke[]> {
    const eingabe = await this.xrechnungEingabe(workspaceId, invoice);

    return xrechnungLuecken(eingabe);
  }

  async zugferdLuecken(
    workspaceId: string,
    invoice: InvoiceEntity,
  ): Promise<XRechnungLuecke[]> {
    return (await this.zugferdPruefung(workspaceId, invoice)).luecken;
  }

  private async zugferdPruefung(
    workspaceId: string,
    invoice: InvoiceEntity,
  ): Promise<{ eingabe: XRechnungInput; luecken: XRechnungLuecke[] }> {
    const eingabe = await this.xrechnungEingabe(workspaceId, invoice);
    const luecken = zugferdLuecken(eingabe);
    const logo = (await this.letterheads.get(workspaceId)).logo;

    if (logo !== null && logo !== undefined && istCmykJpeg(logo)) {
      luecken.push({ wo: 'Briefkopf', was: 'Logo in RGB statt CMYK' });
    }

    return { eingabe, luecken };
  }

  private async zugferdAnhang(
    workspaceId: string,
    invoice: InvoiceEntity,
  ): Promise<ERechnungAnhang | null> {
    if (invoice.number === null) {
      return null;
    }

    const { eingabe, luecken } = await this.zugferdPruefung(
      workspaceId,
      invoice,
    );

    if (luecken.length > 0) {
      return null;
    }

    return {
      xml: renderFacturX(eingabe),
      dateiname: FACTURX_DATEINAME,
      profil: 'EN 16931',
    };
  }

  async xrechnung(
    workspaceId: string,
    id: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    const invoice = await this.invoices.findOne(workspaceId, id);

    if (invoice.number === null) {
      throw new BadRequestException(
        'Eine E-Rechnung gibt es erst, wenn die Rechnung gestellt ist.',
      );
    }

    const eingabe = await this.xrechnungEingabe(workspaceId, invoice);
    const luecken = xrechnungLuecken(eingabe);

    if (luecken.length > 0) {
      throw new BadRequestException(
        `Für die E-Rechnung fehlt noch: ${luecken
          .map((luecke) => `${luecke.was} (${luecke.wo})`)
          .join(', ')}.`,
      );
    }

    const stem = this.fileName(
      invoice.number,
      invoice.correctsInvoiceId !== null,
    ).replace(/\.pdf$/u, '');

    return {
      fileName: `${stem}-XRechnung.xml`,
      content: Buffer.from(renderXRechnung(eingabe), 'utf8'),
    };
  }

  private async xrechnungEingabe(
    workspaceId: string,
    invoice: InvoiceEntity,
  ): Promise<XRechnungInput> {
    const letterhead = briefkopfFuer(
      await this.letterheads.get(workspaceId),
      invoice.issuerSnapshot,
    );

    const correction =
      invoice.correctsInvoiceId === null
        ? null
        : await this.invoices
            .findOne(workspaceId, invoice.correctsInvoiceId)
            .then((original) => original.number)
            .catch(() => null);

    const lines = [...invoice.lines]
      .sort((left, right) => left.position - right.position)
      .map((line) => ({
        position: line.position,
        name: line.name,
        articleNumber: line.articleNumber,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        discountPercent: Number(line.discountPercent),
        taxRatePercent: line.taxRatePercent,
      }));

    const empfaenger = empfaengerAusAnschrift(
      invoice.recipientAddress,
      invoice.company === null
        ? null
        : {
            name: invoice.company.name,
            street: invoice.company.street,
            postalCode: invoice.company.postalCode,
            city: invoice.company.city,
            country: invoice.company.country,
          },
    );

    return {
      number: invoice.number ?? 'ENTWURF',
      issuedOn: invoice.issuedOn,
      dueOn: invoice.dueOn,
      serviceDate: invoice.serviceDate,
      buyerReference: invoice.buyerReference,
      correctsNumber: correction,
      smallBusiness: invoice.smallBusiness,
      befreiung: befreiungVon(invoice),
      currency: invoice.currency,
      notes: [invoice.introText, invoice.closingText].filter(
        (text): text is string => text !== null && text.trim() !== '',
      ),
      seller: {
        name: letterhead?.companyName ?? null,
        street: letterhead?.street ?? null,
        postalCode: letterhead?.postalCode ?? null,
        city: letterhead?.city ?? null,
        country: letterhead?.country ?? null,
        email: letterhead?.email ?? null,
        phone: letterhead?.phone ?? null,
        contactName: letterhead?.representative ?? null,
        vatId: letterhead?.vatId ?? null,
        taxNumber: letterhead?.taxNumber ?? null,
        registerEntry: letterhead?.registerEntry ?? null,
        iban: letterhead?.iban ?? null,
        bic: letterhead?.bic ?? null,
        bankName: letterhead?.bankName ?? null,
      },
      buyer: {
        ...empfaenger,
        email: invoice.company?.invoiceEmail ?? invoice.contact?.email ?? null,
      },
      lines,
      totals: quoteTotals(lines, invoice.smallBusiness),
    };
  }

  async datevLuecken(workspaceId: string): Promise<string[]> {
    return datevLuecken(await this.datevEinstellungen(workspaceId));
  }

  async datev(
    workspaceId: string,
    von: string,
    bis: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(von) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(bis) ||
      von > bis
    ) {
      throw new BadRequestException('Bitte einen gültigen Zeitraum wählen.');
    }

    if (von.slice(0, 4) !== bis.slice(0, 4)) {
      throw new BadRequestException(
        'Ein DATEV-Stapel umfasst ein Wirtschaftsjahr. Bitte von und bis im selben Jahr wählen.',
      );
    }

    const einstellungen = await this.datevEinstellungen(workspaceId);
    const luecken = datevLuecken(einstellungen);

    if (luecken.length > 0) {
      throw new BadRequestException(
        `Für den DATEV-Export fehlt im Briefkopf: ${luecken.join(', ')}.`,
      );
    }

    const rechnungen = await this.invoices.issuedBetween(workspaceId, von, bis);

    const inhalt = datevBuchungsstapel(
      einstellungen,
      rechnungen.map((rechnung) => ({
        number: rechnung.number ?? '',
        issuedOn: rechnung.issuedOn,
        customerName: rechnung.company?.name ?? null,
        smallBusiness: rechnung.smallBusiness,
        taxExemption: rechnung.taxExemption,
        taxGroups: quoteTotals(
          rechnung.lines.map((line) => ({
            quantity: Number(line.quantity),
            unitPriceCents: line.unitPriceCents,
            discountPercent: Number(line.discountPercent),
            taxRatePercent: line.taxRatePercent,
          })),
          rechnung.smallBusiness,
        ).taxGroups,
      })),
      von,
      bis,
      new Date(),
    );

    return {
      fileName: `EXTF_Buchungsstapel_${von}_bis_${bis}.csv`,
      content: alsWindows1252(inhalt),
    };
  }

  private async datevEinstellungen(workspaceId: string) {
    const letterhead = await this.letterheads.get(workspaceId);

    return {
      beraternummer: letterhead.datevBeraternummer,
      mandantennummer: letterhead.datevMandantennummer,
      kontenrahmen: (letterhead.datevKontenrahmen === 'SKR04'
        ? 'SKR04'
        : 'SKR03') as Kontenrahmen,
    };
  }
}
