import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { berlinDate } from '../calendar/berlin-time';
import { InvoiceDocumentsService } from '../invoices/invoice-documents.service';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoiceStatus } from '../invoices/invoice.types';
import { MailService } from '../mail/mail.service';
import { quoteTotals } from '../quotes/quote-totals';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  DunningLevel,
  type DunningState,
  dunningStateOf,
  interestCents,
  lateFeeCents,
  mayRemindToday,
} from './dunning';
import { InvoiceReminderEntity } from './invoice-reminder.entity';
import {
  type ReminderFacts,
  reminderSubject,
  reminderText,
} from './reminder-texts';

export type OpenItem = {
  invoice: InvoiceEntity;
  state: DunningState;
  interestCents: number;
  lateFeeCents: number;
  recipientEmail: string | null;
};

const PAY_WITHIN_DAYS = 7;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const plusDays = (from: string, days: number): string => {
  const date = new Date(`${from.slice(0, 10)}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return isoDate(date);
};

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceReminderEntity)
    private readonly reminders: Repository<InvoiceReminderEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly documents: InvoiceDocumentsService,
    private readonly mail: MailService,
  ) {}

  async openItems(
    workspaceId: string,
    today = berlinDate(new Date()),
  ): Promise<OpenItem[]> {
    const invoices = await this.invoices.find({
      where: { workspaceId, status: In([InvoiceStatus.ISSUED]) },
      relations: { lines: true, company: true, contact: true },
    });

    const sent = await this.reminders.find({ where: { workspaceId } });
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
    });
    const baseRate = workspace?.baseInterestRatePercent ?? null;

    const items: OpenItem[] = [];

    for (const invoice of invoices) {
      const own = sent
        .filter((record) => record.invoiceId === invoice.id)
        .map((record) => ({ level: record.level, sentOn: record.sentOn }));

      const state = dunningStateOf(
        { dueOn: invoice.dueOn, settled: false, sent: own },
        today,
      );

      if (state.level === DunningLevel.NONE) {
        continue;
      }

      const gross = quoteTotals(
        invoice.lines,
        invoice.smallBusiness,
      ).grossCents;

      items.push({
        invoice,
        state,
        interestCents: interestCents(
          gross,
          state.daysOverdue,
          baseRate,
          invoice.consumer,
        ),
        lateFeeCents: lateFeeCents(invoice.consumer, state.inDefault),
        recipientEmail: invoice.contact?.email ?? null,
      });
    }

    return items.sort(
      (left, right) => right.state.daysOverdue - left.state.daysOverdue,
    );
  }

  async preview(
    workspaceId: string,
    invoiceId: string,
    today = berlinDate(new Date()),
  ): Promise<{
    level: DunningLevel;
    subject: string;
    body: string;
    to: string | null;
  }> {
    const { item, level } = await this.nextFor(workspaceId, invoiceId, today);
    const facts = await this.factsFor(workspaceId, item, today);

    return {
      level,
      subject: reminderSubject(level, facts),
      body: reminderText(level, facts),
      to: item.recipientEmail,
    };
  }

  async send(
    workspaceId: string,
    invoiceId: string,
    today = berlinDate(new Date()),
  ): Promise<InvoiceReminderEntity> {
    const { item, level } = await this.nextFor(workspaceId, invoiceId, today);

    if (item.recipientEmail === null) {
      throw new BadRequestException(
        'Für diese Rechnung ist keine E-Mail-Adresse hinterlegt. Tragen Sie beim Ansprechpartner eine ein.',
      );
    }

    const facts = await this.factsFor(workspaceId, item, today);
    const document = await this.documents.pdf(workspaceId, invoiceId);

    const delivered = await this.mail.send({
      to: item.recipientEmail,
      subject: reminderSubject(level, facts),
      text: reminderText(level, facts),
      attachments: [
        {
          filename: document.fileName,
          content: document.content,
          contentType: 'application/pdf',
        },
      ],
    });

    if (!delivered) {
      this.logger.error(
        `Mahnung zu ${facts.invoiceNumber} konnte nicht zugestellt werden`,
      );
    }

    return this.reminders.save(
      this.reminders.create({
        workspaceId,
        invoiceId,
        level,
        sentOn: today,
        sentTo: item.recipientEmail,
        daysOverdue: item.state.daysOverdue,
        interestCents: item.interestCents,
        lateFeeCents: item.lateFeeCents,
      }),
    );
  }

  history(
    workspaceId: string,
    invoiceId: string,
  ): Promise<InvoiceReminderEntity[]> {
    return this.reminders.find({
      where: { workspaceId, invoiceId },
      order: { sentOn: 'ASC' },
    });
  }

  private async nextFor(
    workspaceId: string,
    invoiceId: string,
    today: string,
  ): Promise<{ item: OpenItem; level: DunningLevel }> {
    const item = (await this.openItems(workspaceId, today)).find(
      (candidate) => candidate.invoice.id === invoiceId,
    );

    if (item === undefined) {
      throw new NotFoundException(
        'Diese Rechnung ist nicht offen und überfällig.',
      );
    }

    if (!mayRemindToday(item.state)) {
      throw new BadRequestException(
        item.state.nextStep === null
          ? 'Für diese Rechnung ist die letzte Mahnung bereits hinaus. Der nächste Schritt gehört nicht mehr in dieses Programm.'
          : `Die nächste Stufe ist ab dem ${item.state.nextStepOn ?? ''} möglich.`,
      );
    }

    return { item, level: item.state.nextStep as DunningLevel };
  }

  private async factsFor(
    workspaceId: string,
    item: OpenItem,
    today: string,
  ): Promise<ReminderFacts> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
    });

    return {
      invoiceNumber: item.invoice.number ?? '',
      issuedOn: item.invoice.issuedOn,
      dueOn: item.invoice.dueOn ?? item.invoice.issuedOn,
      grossCents: quoteTotals(item.invoice.lines, item.invoice.smallBusiness)
        .grossCents,
      daysOverdue: item.state.daysOverdue,
      interestCents: item.interestCents,
      lateFeeCents: item.lateFeeCents,
      payBy: plusDays(today, PAY_WITHIN_DAYS),
      companyName: workspace?.name ?? null,
    };
  }
}
