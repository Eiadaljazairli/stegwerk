import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { LetterheadsService } from './letterheads.service';
import { QuoteLineEntity } from './quote-line.entity';
import { QuoteEntity } from './quote.entity';
import { belegFehler } from './quote-totals';
import {
  befreiungAus,
  befreiungVon,
  type Steuerbefreiung,
} from './steuerbefreiung';
import { QuoteStatus, TAX_RATES } from './quote.types';
import { assertVerweiseImBereich } from '../workspaces/verweise';
import {
  assertZielSichtbar,
  neueZiele,
  nurSichtbareZeilen,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';
import { webhookDaten } from '../crm/workspace-scoped.service';
import { aenderungen, melde } from '../webhooks/ereignisse';
import { berlinDate } from '../calendar/berlin-time';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VALIDITY_DAYS = 30;

const NUMBERING_ATTEMPTS = 5;

export type QuoteLineInput = {
  productId?: string | null;
  name: string;
  articleNumber?: string | null;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent?: number;
  taxRatePercent: number;
};

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly letterheads: LetterheadsService,
  ) {}

  private relations() {
    return {
      company: true,
      contact: true,
      deal: true,
      lines: true,
      bearbeiter: true,
    };
  }

  async list(workspaceId: string): Promise<QuoteEntity[]> {
    return nurSichtbareZeilen(
      this.quotes.manager,
      'quotes',
      await this.quotes.find({
        where: { workspaceId },
        relations: this.relations(),
        order: { createdAt: 'DESC' },
      }),
      'bearbeiterId',
    );
  }

  async findOne(workspaceId: string, id: string): Promise<QuoteEntity> {
    const quote = await this.quotes.findOne({
      where: { id, workspaceId },
      relations: this.relations(),
    });

    if (
      quote === null ||
      !(await zielSichtbar(this.quotes.manager, quote, quote.bearbeiterId))
    ) {
      throw new NotFoundException('Dieses Angebot gibt es nicht.');
    }

    quote.lines.sort((left, right) => left.position - right.position);

    return quote;
  }

  private async nextNumber(
    manager: EntityManager,
    workspaceId: string,
    year: number,
  ): Promise<string> {
    const prefix = `AN-${year}-`;

    const rows: { number: string }[] = await manager.query(
      `SELECT "number" FROM quotes
        WHERE "workspaceId" = $1 AND "number" LIKE $2
        ORDER BY "number" DESC LIMIT 1`,
      [workspaceId, `${prefix}%`],
    );

    const previous =
      rows.length === 0 ? 0 : Number(rows[0].number.slice(prefix.length));

    return `${prefix}${String(previous + 1).padStart(4, '0')}`;
  }

  private async assertOwned(
    workspaceId: string,
    input: {
      companyId?: string | null;
      contactId?: string | null;
      dealId?: string | null;
    },
  ): Promise<void> {
    await assertVerweiseImBereich(this.dataSource.manager, workspaceId, input);
  }

  async create(
    workspaceId: string,
    input: {
      companyId?: string | null;
      contactId?: string | null;
      dealId?: string | null;
      validUntil?: string | null;
      introText?: string | null;
      closingText?: string | null;
      smallBusiness?: boolean;
      taxExemption?: Steuerbefreiung | null;
      taxExemptionNote?: string | null;
      recipientVatId?: string | null;
    },
    bearbeiterId: string | null = null,
  ): Promise<QuoteEntity> {
    const heute = berlinDate(new Date());

    const letterhead = await this.letterheads.get(workspaceId);
    const validityDays =
      letterhead.defaultValidityDays || DEFAULT_VALIDITY_DAYS;
    const validUntil =
      input.validUntil ??
      new Date(Date.parse(`${heute}T00:00:00Z`) + validityDays * DAY_MS)
        .toISOString()
        .slice(0, 10);

    await this.assertOwned(workspaceId, input);
    await assertZielSichtbar(this.quotes.manager, input);

    const befreiung = befreiungAus(input);

    const recipientAddress =
      input.companyId == null
        ? null
        : await this.addressFor(workspaceId, input.companyId);

    for (let attempt = 0; attempt < NUMBERING_ATTEMPTS; attempt += 1) {
      try {
        const saved = await this.dataSource.transaction(async (manager) => {
          const number = await this.nextNumber(
            manager,
            workspaceId,
            Number(heute.slice(0, 4)),
          );

          return manager.save(
            manager.create(QuoteEntity, {
              workspaceId,
              number,
              status: QuoteStatus.DRAFT,
              companyId: input.companyId ?? null,
              contactId: input.contactId ?? null,
              dealId: input.dealId ?? null,
              bearbeiterId,
              recipientAddress,
              issuedOn: heute,
              validUntil,
              introText: input.introText ?? letterhead.defaultIntroText,
              closingText: input.closingText ?? letterhead.defaultClosingText,
              smallBusiness: input.smallBusiness ?? letterhead.smallBusiness,
              ...befreiung,
            }),
          );
        });

        const angelegt = await this.findOne(workspaceId, saved.id);

        melde({
          workspaceId,
          event: 'quote.created',
          data: webhookDaten(angelegt),
        });

        return angelegt;
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') {
          throw error;
        }
      }
    }

    throw new BadRequestException(
      'Es ließ sich keine Angebotsnummer vergeben. Bitte versuchen Sie es noch einmal.',
    );
  }

  private async addressFor(
    workspaceId: string,
    companyId: string,
  ): Promise<string | null> {
    const company = await this.dataSource.manager.findOne(CompanyEntity, {
      where: { id: companyId, workspaceId },
    });

    if (company === null) {
      throw new NotFoundException('Diese Firma gibt es nicht.');
    }

    const ort = [company.postalCode, company.city]
      .filter((part) => part !== null && part !== '')
      .join(' ');

    return [company.name, company.street, ort, company.country]
      .filter((part) => part !== null && part !== '')
      .join('\n');
  }

  private assertEditable(quote: QuoteEntity): void {
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException(
        'Dieses Angebot ist bereits versandt. Kopieren Sie es für eine neue Fassung.',
      );
    }
  }

  async update(
    workspaceId: string,
    id: string,
    input: Partial<{
      companyId: string | null;
      contactId: string | null;
      dealId: string | null;
      validUntil: string;
      introText: string | null;
      closingText: string | null;
      smallBusiness: boolean;
      recipientAddress: string | null;
      taxExemption: Steuerbefreiung | null;
      taxExemptionNote: string | null;
      recipientVatId: string | null;
    }>,
  ): Promise<QuoteEntity> {
    const quote = await this.findOne(workspaceId, id);
    const vorher = webhookDaten(quote);

    this.assertEditable(quote);
    await this.assertOwned(workspaceId, input);
    await assertZielSichtbar(this.quotes.manager, neueZiele(input, quote));

    if (
      input.recipientAddress === undefined &&
      input.companyId !== undefined &&
      input.companyId !== quote.companyId
    ) {
      quote.recipientAddress =
        input.companyId === null
          ? null
          : await this.addressFor(workspaceId, input.companyId);
    }

    this.quotes.merge(quote, { ...input, ...befreiungAus(input, quote) });

    await this.quotes.save(quote);

    return this.meldeGeaendert(workspaceId, vorher, id);
  }

  private async meldeGeaendert(
    workspaceId: string,
    vorher: Record<string, unknown>,
    id: string,
  ): Promise<QuoteEntity> {
    const nachher = await this.findOne(workspaceId, id);
    const data = webhookDaten(nachher);

    melde({
      workspaceId,
      event: 'quote.updated',
      data,
      changes: aenderungen(vorher, data),
    });

    return nachher;
  }

  private checkLine(line: QuoteLineInput): void {
    if (line.name.trim() === '') {
      throw new BadRequestException('Jede Position braucht eine Bezeichnung.');
    }

    if (line.quantity <= 0) {
      throw new BadRequestException('Eine Menge muss größer als null sein.');
    }

    if (line.unitPriceCents < 0) {
      throw new BadRequestException('Ein Preis kann nicht negativ sein.');
    }

    if (line.discountPercent !== undefined) {
      if (line.discountPercent < 0 || line.discountPercent > 100) {
        throw new BadRequestException(
          'Ein Rabatt liegt zwischen 0 und 100 Prozent.',
        );
      }
    }

    if (
      !TAX_RATES.includes(line.taxRatePercent as (typeof TAX_RATES)[number])
    ) {
      throw new BadRequestException(
        `${line.taxRatePercent}% ist kein Steuersatz, den dieses Angebot kennt.`,
      );
    }
  }

  async setLines(
    workspaceId: string,
    quoteId: string,
    lines: QuoteLineInput[],
  ): Promise<QuoteEntity> {
    const quote = await this.findOne(workspaceId, quoteId);
    const vorher = webhookDaten(quote);

    this.assertEditable(quote);

    for (const line of lines) {
      this.checkLine(line);
    }

    const fehler = belegFehler(
      lines.map((line) => ({
        ...line,
        discountPercent: line.discountPercent ?? 0,
      })),
    );

    if (fehler) {
      throw new BadRequestException(fehler);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(QuoteLineEntity, { quoteId });

      await manager.save(
        lines.map((line, index) =>
          manager.create(QuoteLineEntity, {
            quoteId,
            productId: line.productId ?? null,
            position: index,
            name: line.name.trim(),
            articleNumber: line.articleNumber ?? null,
            description: line.description ?? null,
            quantity: line.quantity,
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            discountPercent: line.discountPercent ?? 0,
            taxRatePercent: line.taxRatePercent,
          }),
        ),
      );
    });

    return this.meldeGeaendert(workspaceId, vorher, quoteId);
  }

  async setTexts(
    workspaceId: string,
    input: {
      id: string;
      introText?: string | null;
      closingText?: string | null;
      lines?: { id: string; description?: string | null }[];
    },
  ): Promise<QuoteEntity> {
    const quote = await this.findOne(workspaceId, input.id);
    const vorher = webhookDaten(quote);

    this.assertEditable(quote);

    const eigene = new Set(quote.lines.map((line) => line.id));
    const fremd = (input.lines ?? []).filter((line) => !eigene.has(line.id));

    if (fremd.length > 0) {
      throw new BadRequestException(
        'Diese Position gehört nicht zu diesem Angebot.',
      );
    }

    const leerAlsNull = (wert: string | null | undefined) =>
      wert === undefined
        ? undefined
        : wert === null || wert.trim() === ''
          ? null
          : wert;

    await this.dataSource.transaction(async (manager) => {
      const texte: Partial<QuoteEntity> = {};
      const einleitung = leerAlsNull(input.introText);
      const schluss = leerAlsNull(input.closingText);

      if (einleitung !== undefined) texte.introText = einleitung;
      if (schluss !== undefined) texte.closingText = schluss;

      await manager.update(
        QuoteEntity,
        { id: quote.id, workspaceId },
        { ...texte, updatedAt: new Date() },
      );

      for (const line of input.lines ?? []) {
        await manager.update(
          QuoteLineEntity,
          { id: line.id, quoteId: quote.id },
          { description: leerAlsNull(line.description) ?? null },
        );
      }
    });

    return this.meldeGeaendert(workspaceId, vorher, quote.id);
  }

  async markSent(workspaceId: string, id: string): Promise<QuoteEntity> {
    const quote = await this.findOne(workspaceId, id);

    this.assertEditable(quote);

    if (quote.lines.length === 0) {
      throw new BadRequestException(
        'Ein Angebot ohne Positionen ist kein Angebot.',
      );
    }

    const vorher = webhookDaten(quote);

    quote.status = QuoteStatus.SENT;
    quote.sentAt = new Date();

    await this.quotes.save(quote);

    return this.meldeGeaendert(workspaceId, vorher, id);
  }

  async decide(
    workspaceId: string,
    id: string,
    accepted: boolean,
  ): Promise<QuoteEntity> {
    const quote = await this.findOne(workspaceId, id);

    if (quote.status !== QuoteStatus.SENT) {
      throw new BadRequestException(
        'Nur ein versandtes Angebot kann angenommen oder abgelehnt werden.',
      );
    }

    const vorher = webhookDaten(quote);

    quote.status = accepted ? QuoteStatus.ACCEPTED : QuoteStatus.DECLINED;
    quote.decidedAt = new Date();

    await this.quotes.save(quote);

    melde({
      workspaceId,
      event: accepted ? 'quote.accepted' : 'quote.declined',
      data: { id: quote.id, number: quote.number, online: false },
    });

    return this.meldeGeaendert(workspaceId, vorher, id);
  }

  async duplicate(workspaceId: string, id: string): Promise<QuoteEntity> {
    const source = await this.findOne(workspaceId, id);

    const copy = await this.create(workspaceId, {
      companyId: source.companyId,
      contactId: source.contactId,
      dealId: source.dealId,
      introText: source.introText,
      closingText: source.closingText,
      smallBusiness: source.smallBusiness,
      ...befreiungVon(source),
    });

    if (source.lines.length > 0) {
      await this.setLines(
        workspaceId,
        copy.id,
        source.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          articleNumber: line.articleNumber,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        })),
      );
    }

    return this.findOne(workspaceId, copy.id);
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const quote = await this.findOne(workspaceId, id);

    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException(
        'Ein versandtes Angebot lässt sich nicht löschen. Tragen Sie stattdessen ein, dass es abgelehnt wurde.',
      );
    }

    const daten = webhookDaten(quote);

    await this.quotes.remove(quote);
    melde({ workspaceId, event: 'quote.deleted', data: daten });

    return true;
  }
}
