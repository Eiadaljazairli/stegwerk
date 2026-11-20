import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  type EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';

import { berlinDate } from '../calendar/berlin-time';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { belegFehler, quoteTotals } from '../quotes/quote-totals';
import {
  befreiungAus,
  befreiungVon,
  type Steuerbefreiung,
} from '../quotes/steuerbefreiung';
import { absenderKopie } from './absender';
import { InvoiceLineEntity } from './invoice-line.entity';
import { formatInvoiceNumber } from './invoice-numbers';
import {
  type GapField,
  invoiceGaps,
  mayCancel,
  mayDelete,
  mayEdit,
  mayIssue,
  mayMarkPaid,
  statusAfterIssue,
} from './invoice-rules';
import { InvoiceEntity } from './invoice.entity';
import {
  CORRECTION_TITLE,
  DEFAULT_INVOICE_INTRO,
  DEFAULT_PAYMENT_TERM_DAYS,
  InvoiceStatus,
} from './invoice.types';
import { webhookDaten } from '../crm/workspace-scoped.service';
import { aenderungen, melde } from '../webhooks/ereignisse';
import { assertVerweiseImBereich } from '../workspaces/verweise';
import {
  assertZielSichtbar,
  irgendwoEingeschraenkt,
  neueZiele,
  nurSichtbareZeilen,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';

export type InvoiceLineInput = {
  name: string;
  articleNumber?: string | null;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent?: number | null;
  taxRatePercent: number;
};

export type CreateInvoiceInput = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  recipientAddress?: string | null;
  buyerReference?: string | null;
  serviceDate?: string | null;
  paymentTermDays?: number | null;
  introText?: string | null;
  closingText?: string | null;
  taxExemption?: Steuerbefreiung | null;
  taxExemptionNote?: string | null;
  recipientVatId?: string | null;
};

export type UpdateInvoiceInput = CreateInvoiceInput & { id: string };

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const rechnungsDaten = (
  invoice: InvoiceEntity,
  grossCents: number,
): Record<string, unknown> => ({
  id: invoice.id,
  number: invoice.number,
  status: invoice.status,
  issuedOn: invoice.issuedOn,
  dueOn: invoice.dueOn,
  grossCents,
  currency: invoice.currency,
  companyId: invoice.companyId,
  companyName: invoice.company?.name ?? null,
});

const leerAlsNull = (wert: string | null | undefined): string | null => {
  const getrimmt = (wert ?? '').trim();

  return getrimmt === '' ? null : getrimmt;
};

const plusDays = (from: string, days: number): string => {
  const date = new Date(`${from}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return isoDate(date);
};

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceLineEntity)
    private readonly lines: Repository<InvoiceLineEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
    @InjectRepository(LetterheadEntity)
    private readonly letterheads: Repository<LetterheadEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async issuedBetween(
    workspaceId: string,
    von: string,
    bis: string,
  ): Promise<InvoiceEntity[]> {
    if (await irgendwoEingeschraenkt()) {
      throw new ForbiddenException(
        'Den Export für die Buchhaltung gibt es nur für Rollen, die alle Datensätze sehen.',
      );
    }

    return this.invoices.find({
      where: {
        workspaceId,
        number: Not(IsNull()),
        issuedOn: Between(von, bis),
      },
      relations: { lines: true, company: true },
      order: { issuedOn: 'ASC', number: 'ASC' },
    });
  }

  async list(workspaceId: string): Promise<InvoiceEntity[]> {
    return nurSichtbareZeilen(
      this.invoices.manager,
      'invoices',
      await this.invoices.find({
        where: { workspaceId },
        relations: { lines: true, company: true, contact: true },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findOne(workspaceId: string, id: string): Promise<InvoiceEntity> {
    const invoice = await this.invoices.findOne({
      where: { id, workspaceId },
      relations: { lines: true, company: true, contact: true, deal: true },
    });

    if (
      invoice === null ||
      !(await zielSichtbar(this.invoices.manager, invoice))
    ) {
      throw new NotFoundException('Rechnung nicht gefunden.');
    }

    invoice.lines.sort((left, right) => left.position - right.position);

    return invoice;
  }

  async createFromQuote(
    workspaceId: string,
    quoteId: string,
  ): Promise<InvoiceEntity> {
    const quote = await this.quotes.findOne({
      where: { id: quoteId, workspaceId },
      relations: { lines: true },
    });

    if (
      quote === null ||
      !(await zielSichtbar(this.invoices.manager, quote, quote.bearbeiterId))
    ) {
      throw new NotFoundException('Angebot nicht gefunden.');
    }

    const today = berlinDate(new Date());

    const invoice = await this.invoices.save(
      this.invoices.create({
        workspaceId,
        status: InvoiceStatus.DRAFT,
        quoteId: quote.id,
        companyId: quote.companyId,
        contactId: quote.contactId,
        dealId: quote.dealId,
        recipientAddress: quote.recipientAddress,
        issuedOn: today,
        serviceDate: today,
        paymentTermDays: DEFAULT_PAYMENT_TERM_DAYS,
        dueOn: plusDays(today, DEFAULT_PAYMENT_TERM_DAYS),
        introText: DEFAULT_INVOICE_INTRO,
        closingText: null,
        currency: quote.currency,
        smallBusiness: quote.smallBusiness,
        ...befreiungVon(quote),
      }),
    );

    const ordered = [...quote.lines].sort(
      (left, right) => left.position - right.position,
    );

    await this.lines.save(
      ordered.map((line, index) =>
        this.lines.create({
          invoiceId: invoice.id,
          position: index,
          name: line.name,
          articleNumber: line.articleNumber,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        }),
      ),
    );

    return this.meldeRechnung(workspaceId, invoice.id);
  }

  async create(
    workspaceId: string,
    input: CreateInvoiceInput,
  ): Promise<InvoiceEntity> {
    await assertVerweiseImBereich(this.dataSource.manager, workspaceId, {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
    });
    await assertZielSichtbar(this.dataSource.manager, input);

    const today = berlinDate(new Date());
    const term = input.paymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS;
    const letterhead = await this.letterheads.findOne({
      where: { workspaceId },
    });

    const invoice = await this.invoices.save(
      this.invoices.create({
        workspaceId,
        status: InvoiceStatus.DRAFT,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        recipientAddress: input.recipientAddress ?? null,
        buyerReference: leerAlsNull(input.buyerReference),
        issuedOn: today,
        serviceDate: input.serviceDate ?? today,
        paymentTermDays: term,
        dueOn: plusDays(today, term),
        introText: input.introText ?? DEFAULT_INVOICE_INTRO,
        closingText: input.closingText ?? null,
        smallBusiness: letterhead?.smallBusiness ?? false,
        ...befreiungAus(input),
      }),
    );

    return this.meldeRechnung(workspaceId, invoice.id);
  }

  async copyAsDraft(
    workspaceId: string,
    sourceId: string,
    serviceDate: string,
    seriesId: string | null,
  ): Promise<InvoiceEntity> {
    const source = await this.findOne(workspaceId, sourceId);
    const letterhead = await this.letterheads.findOne({
      where: { workspaceId },
    });
    const today = berlinDate(new Date());

    const invoice = await this.invoices.save(
      this.invoices.create({
        workspaceId,
        status: InvoiceStatus.DRAFT,
        seriesId,
        companyId: source.companyId,
        contactId: source.contactId,
        dealId: source.dealId,
        recipientAddress: source.recipientAddress,
        buyerReference: source.buyerReference,
        issuedOn: today,
        serviceDate,
        paymentTermDays: source.paymentTermDays,
        dueOn: plusDays(today, source.paymentTermDays),
        introText: source.introText,
        closingText: source.closingText,
        currency: source.currency,
        smallBusiness: letterhead?.smallBusiness ?? source.smallBusiness,
        ...befreiungVon(source),
      }),
    );

    const ordered = [...source.lines].sort(
      (left, right) => left.position - right.position,
    );

    await this.lines.save(
      ordered.map((line, index) =>
        this.lines.create({
          invoiceId: invoice.id,
          position: index,
          name: line.name,
          articleNumber: line.articleNumber,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        }),
      ),
    );

    return this.meldeRechnung(workspaceId, invoice.id);
  }

  async update(
    workspaceId: string,
    input: UpdateInvoiceInput,
  ): Promise<InvoiceEntity> {
    const invoice = await this.findOne(workspaceId, input.id);
    const vorher = webhookDaten(invoice);

    this.assertEditable(invoice);

    await assertVerweiseImBereich(this.dataSource.manager, workspaceId, {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
    });
    await assertZielSichtbar(
      this.dataSource.manager,
      neueZiele(input, invoice),
    );

    const term = input.paymentTermDays ?? invoice.paymentTermDays;

    await this.dataSource.transaction(async (manager) => {
      this.assertEditable(
        await this.gesperrt(manager, workspaceId, invoice.id),
      );

      await manager.update(InvoiceEntity, invoice.id, {
        companyId: input.companyId ?? invoice.companyId,
        contactId: input.contactId ?? invoice.contactId,
        dealId: input.dealId ?? invoice.dealId,
        recipientAddress: input.recipientAddress ?? invoice.recipientAddress,
        buyerReference:
          input.buyerReference === undefined
            ? invoice.buyerReference
            : leerAlsNull(input.buyerReference),
        serviceDate: input.serviceDate ?? invoice.serviceDate,
        paymentTermDays: term,
        dueOn: plusDays(invoice.issuedOn, term),
        introText: input.introText ?? invoice.introText,
        closingText: input.closingText ?? invoice.closingText,
        ...befreiungAus(input, invoice),
      });
    });

    return this.meldeRechnung(workspaceId, invoice.id, vorher);
  }

  async setLines(
    workspaceId: string,
    invoiceId: string,
    input: InvoiceLineInput[],
  ): Promise<InvoiceEntity> {
    const invoice = await this.findOne(workspaceId, invoiceId);
    const vorher = webhookDaten(invoice);

    this.assertEditable(invoice);

    if (input.some((line) => line.name.trim() === '')) {
      throw new BadRequestException('Jede Position braucht eine Bezeichnung.');
    }

    const fehler = belegFehler(
      input.map((line) => ({
        ...line,
        discountPercent: line.discountPercent ?? 0,
      })),
    );

    if (fehler) {
      throw new BadRequestException(fehler);
    }

    await this.dataSource.transaction(async (manager) => {
      this.assertEditable(
        await this.gesperrt(manager, workspaceId, invoice.id),
      );

      await manager.delete(InvoiceLineEntity, { invoiceId: invoice.id });
      await manager.save(
        input.map((line, index) =>
          manager.create(InvoiceLineEntity, {
            invoiceId: invoice.id,
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

    return this.meldeRechnung(workspaceId, invoice.id, vorher);
  }

  async gaps(workspaceId: string, id: string): Promise<GapField[]> {
    const invoice = await this.findOne(workspaceId, id);
    const letterhead = await this.letterheads.findOne({
      where: { workspaceId },
    });

    return invoiceGaps(
      {
        companyName: letterhead?.companyName ?? null,
        street: letterhead?.street ?? null,
        postalCode: letterhead?.postalCode ?? null,
        city: letterhead?.city ?? null,
        taxNumber: letterhead?.taxNumber ?? null,
        vatId: letterhead?.vatId ?? null,
      },
      {
        recipientAddress: invoice.recipientAddress,
        serviceDate: invoice.serviceDate,
        lineCount: invoice.lines.length,
        smallBusiness: invoice.smallBusiness,
        taxExemption: invoice.taxExemption,
        taxExemptionNote: invoice.taxExemptionNote,
        recipientVatId: invoice.recipientVatId,
        taxRates: invoice.lines.map((line) => line.taxRatePercent),
      },
    );
  }

  async issue(workspaceId: string, id: string): Promise<InvoiceEntity> {
    const invoice = await this.findOne(workspaceId, id);

    if (!mayIssue(invoice.status)) {
      throw new BadRequestException(
        'Nur ein Entwurf kann gestellt werden. Diese Rechnung ist es nicht mehr.',
      );
    }

    const offen = await this.gaps(workspaceId, id);

    if (offen.length > 0) {
      throw new BadRequestException(
        `Es fehlt noch: ${offen.map((gap) => gap.label).join(', ')}.`,
      );
    }

    const today = berlinDate(new Date());
    let totals = quoteTotals(invoice.lines, invoice.smallBusiness);

    await this.dataSource.transaction(async (manager) => {
      const jetzt = await this.gesperrt(manager, workspaceId, invoice.id);

      if (!mayIssue(jetzt.status)) {
        throw new BadRequestException(
          'Nur ein Entwurf kann gestellt werden. Diese Rechnung ist es nicht mehr.',
        );
      }

      const zeilen = await manager.find(InvoiceLineEntity, {
        where: { invoiceId: invoice.id },
      });

      if (zeilen.length === 0) {
        throw new BadRequestException('Es fehlt noch: Positionen.');
      }

      totals = quoteTotals(zeilen, jetzt.smallBusiness);

      const number = await this.nextNumber(manager, workspaceId, today);
      const briefkopf = await manager.findOne(LetterheadEntity, {
        where: { workspaceId },
      });

      await manager.update(InvoiceEntity, invoice.id, {
        issuerSnapshot: absenderKopie(briefkopf) as never,
        number,
        status: statusAfterIssue(totals.grossCents),
        issuedOn: today,
        dueOn: plusDays(today, invoice.paymentTermDays),
        issuedAt: new Date(),
        paidAt: totals.grossCents === 0 ? new Date() : null,
      });
    });

    const gestellt = await this.meldeRechnung(
      workspaceId,
      invoice.id,
      webhookDaten(invoice),
    );

    melde({
      workspaceId,
      event: 'invoice.issued',
      data: rechnungsDaten(gestellt, totals.grossCents),
    });

    return gestellt;
  }

  async markPaid(
    workspaceId: string,
    id: string,
    paidOn?: string | null,
  ): Promise<InvoiceEntity> {
    const invoice = await this.findOne(workspaceId, id);

    if (!mayMarkPaid(invoice.status)) {
      throw new BadRequestException(
        'Nur eine gestellte, offene Rechnung kann als bezahlt gebucht werden.',
      );
    }

    const gebucht = await this.invoices.update(
      { id: invoice.id, workspaceId, status: invoice.status },
      {
        status: InvoiceStatus.PAID,
        paidAt:
          paidOn === undefined || paidOn === null
            ? new Date()
            : new Date(`${paidOn}T12:00:00Z`),
      },
    );

    if ((gebucht.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Die Rechnung wurde inzwischen geändert. Bitte laden Sie die Seite neu.',
      );
    }

    const bezahlt = await this.meldeRechnung(
      workspaceId,
      invoice.id,
      webhookDaten(invoice),
    );

    melde({
      workspaceId,
      event: 'invoice.paid',
      data: rechnungsDaten(
        bezahlt,
        quoteTotals(bezahlt.lines, bezahlt.smallBusiness).grossCents,
      ),
    });

    return bezahlt;
  }

  async cancel(workspaceId: string, id: string): Promise<InvoiceEntity> {
    const original = await this.findOne(workspaceId, id);

    if (!mayCancel(original.status, original.correctsInvoiceId !== null)) {
      throw new BadRequestException(
        original.correctsInvoiceId !== null
          ? 'Eine Rechnungskorrektur lässt sich nicht selbst stornieren.'
          : 'Nur eine gestellte Rechnung lässt sich stornieren.',
      );
    }

    const today = berlinDate(new Date());
    let correctionId = '';

    await this.dataSource.transaction(async (manager) => {
      const jetzt = await this.gesperrt(manager, workspaceId, original.id);

      if (!mayCancel(jetzt.status, jetzt.correctsInvoiceId !== null)) {
        throw new BadRequestException(
          'Diese Rechnung wurde inzwischen schon storniert.',
        );
      }

      const number = await this.nextNumber(manager, workspaceId, today);
      const briefkopf = await manager.findOne(LetterheadEntity, {
        where: { workspaceId },
      });

      const correction = await manager.save(
        manager.create(InvoiceEntity, {
          workspaceId,
          issuerSnapshot: absenderKopie(briefkopf),
          number,
          status: InvoiceStatus.ISSUED,
          correctsInvoiceId: original.id,
          quoteId: original.quoteId,
          companyId: original.companyId,
          contactId: original.contactId,
          dealId: original.dealId,
          recipientAddress: original.recipientAddress,
          buyerReference: original.buyerReference,
          issuedOn: today,
          serviceDate: original.serviceDate,
          paymentTermDays: original.paymentTermDays,
          dueOn: today,
          introText: `${CORRECTION_TITLE} zur Rechnung ${original.number ?? ''}.`,
          closingText: null,
          currency: original.currency,
          smallBusiness: original.smallBusiness,
          ...befreiungVon(original),
          issuedAt: new Date(),
        }),
      );

      correctionId = correction.id;

      await manager.save(
        original.lines.map((line) =>
          manager.create(InvoiceLineEntity, {
            invoiceId: correction.id,
            position: line.position,
            name: line.name,
            articleNumber: line.articleNumber,
            description: line.description,
            quantity: -line.quantity,
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            discountPercent: line.discountPercent,
            taxRatePercent: line.taxRatePercent,
          }),
        ),
      );

      await manager.update(InvoiceEntity, original.id, {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
      });
    });

    await this.meldeRechnung(workspaceId, original.id, webhookDaten(original));

    return this.meldeRechnung(workspaceId, correctionId);
  }

  private async meldeRechnung(
    workspaceId: string,
    id: string,
    vorher?: Record<string, unknown>,
  ): Promise<InvoiceEntity> {
    const nachher = await this.findOne(workspaceId, id);
    const data = webhookDaten(nachher);

    melde(
      vorher === undefined
        ? { workspaceId, event: 'invoice.created', data }
        : {
            workspaceId,
            event: 'invoice.updated',
            data,
            changes: aenderungen(vorher, data),
          },
    );

    return nachher;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const invoice = await this.findOne(workspaceId, id);

    if (!mayDelete(invoice.status)) {
      throw new BadRequestException(
        'Eine gestellte Rechnung wird nicht gelöscht, sondern storniert.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const jetzt = await this.gesperrt(manager, workspaceId, invoice.id);

      if (!mayDelete(jetzt.status)) {
        throw new BadRequestException(
          'Eine gestellte Rechnung wird nicht gelöscht, sondern storniert.',
        );
      }

      await manager.delete(InvoiceEntity, { id: invoice.id, workspaceId });
    });

    melde({
      workspaceId,
      event: 'invoice.deleted',
      data: webhookDaten(invoice),
    });

    return true;
  }

  async forQuote(
    workspaceId: string,
    quoteId: string,
  ): Promise<InvoiceEntity[]> {
    return nurSichtbareZeilen(
      this.invoices.manager,
      'invoices',
      await this.invoices.find({
        where: { workspaceId, quoteId },
        relations: { lines: true },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async issuedNumbers(workspaceId: string): Promise<string[]> {
    const rows = await this.invoices.find({
      where: {
        workspaceId,
        status: In([
          InvoiceStatus.ISSUED,
          InvoiceStatus.PAID,
          InvoiceStatus.CANCELLED,
        ]),
      },
      select: { number: true },
    });

    return rows
      .map((row) => row.number)
      .filter((number): number is string => number !== null);
  }

  private async gesperrt(
    manager: EntityManager,
    workspaceId: string,
    id: string,
  ): Promise<InvoiceEntity> {
    const invoice = await manager.findOne(InvoiceEntity, {
      where: { id, workspaceId },
      lock: { mode: 'pessimistic_write' },
    });

    if (invoice === null) {
      throw new NotFoundException('Diese Rechnung gibt es nicht.');
    }

    return invoice;
  }

  private assertEditable(invoice: InvoiceEntity): void {
    if (!mayEdit(invoice.status)) {
      throw new BadRequestException(
        'Eine gestellte Rechnung lässt sich nicht mehr ändern. Stornieren Sie sie und schreiben Sie eine neue.',
      );
    }
  }

  private async nextNumber(
    manager: DataSource['manager'],
    workspaceId: string,
    today: string,
  ): Promise<string> {
    const year = Number(today.slice(0, 4));

    await manager.query(
      `INSERT INTO "invoice_counters" ("workspaceId", "year", "lastSequence")
       VALUES ($1, $2, 0)
       ON CONFLICT ("workspaceId", "year") DO NOTHING`,
      [workspaceId, year],
    );

    const locked = await manager.query<{ lastSequence: number }[]>(
      `SELECT "lastSequence" FROM "invoice_counters"
        WHERE "workspaceId" = $1 AND "year" = $2
        FOR UPDATE`,
      [workspaceId, year],
    );

    const next = Number(locked[0]?.lastSequence ?? 0) + 1;

    await manager.query(
      `UPDATE "invoice_counters" SET "lastSequence" = $3
        WHERE "workspaceId" = $1 AND "year" = $2`,
      [workspaceId, year, next],
    );

    return formatInvoiceNumber(year, next);
  }
}
