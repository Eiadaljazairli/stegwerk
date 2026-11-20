import { Injectable } from '@nestjs/common';
import { befreiungVon } from './steuerbefreiung';

import { LetterheadsService } from './letterheads.service';
import { renderQuotePdf } from './quote-pdf';
import { quoteTotals } from './quote-totals';
import { QuotesService } from './quotes.service';

@Injectable()
export class QuoteDocumentsService {
  constructor(
    private readonly quotes: QuotesService,
    private readonly letterheads: LetterheadsService,
  ) {}

  fileName(number: string): string {
    return `Angebot-${number.replace(/[^\w.-]/gu, '-')}.pdf`;
  }

  async pdf(
    workspaceId: string,
    id: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    const quote = await this.quotes.findOne(workspaceId, id);
    const letterhead = await this.letterheads.get(workspaceId);

    const content = await renderQuotePdf({
      number: quote.number,
      issuedOn: quote.issuedOn,
      validUntil: quote.validUntil,
      recipientAddress: quote.recipientAddress,
      introText: quote.introText,
      closingText: quote.closingText,
      smallBusiness: quote.smallBusiness,
      befreiung: befreiungVon(quote),
      contactName:
        quote.contact === null
          ? null
          : `${quote.contact.firstName} ${quote.contact.lastName}`.trim(),
      bearbeiter:
        quote.bearbeiter === null ||
        quote.bearbeiter.email.endsWith('@stegwerk.invalid')
          ? null
          : {
              name: `${quote.bearbeiter.firstName} ${quote.bearbeiter.lastName}`.trim(),
              funktion: quote.bearbeiter.funktion,
              durchwahl: quote.bearbeiter.durchwahl,
              email: quote.bearbeiter.email,
            },
      lines: quote.lines.map((line) => ({
        position: line.position,
        name: line.name,
        articleNumber: line.articleNumber,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        discountPercent: Number(line.discountPercent),
        taxRatePercent: line.taxRatePercent,
      })),
      totals: quoteTotals(
        quote.lines.map((line) => ({
          quantity: Number(line.quantity),
          unitPriceCents: line.unitPriceCents,
          discountPercent: Number(line.discountPercent),
          taxRatePercent: line.taxRatePercent,
        })),
        quote.smallBusiness,
      ),
      letterhead,
    });

    return { fileName: this.fileName(quote.number), content };
  }
}
