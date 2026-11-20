import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { type InvoiceDocumentsService } from '../invoices/invoice-documents.service';
import { InvoiceLineEntity } from '../invoices/invoice-line.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoiceStatus } from '../invoices/invoice.types';
import { type Mail, type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { DunningLevel } from './dunning';
import { DunningService } from './dunning.service';
import { InvoiceReminderEntity } from './invoice-reminder.entity';

const SUITE = 'dunning';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: DunningService;
let workspaceId: string;
let otherWorkspaceId: string;
let contactId: string;
let companyId: string;
let versandt: Mail[] = [];

const postfach = {
  send: (mail: Mail) => {
    versandt.push(mail);

    return Promise.resolve(true);
  },
} as unknown as MailService;

const belege = {
  pdf: () =>
    Promise.resolve({
      fileName: 'Rechnung-RE-2026-0001.pdf',
      content: Buffer.from('%PDF-1.3 Attrappe'),
    }),
} as unknown as InvoiceDocumentsService;

const rechnung = async (options: {
  dueOn: string;
  consumer?: boolean;
  status?: InvoiceStatus;
  workspace?: string;
  withContact?: boolean;
}): Promise<InvoiceEntity> => {
  const invoices = dataSource.getRepository(InvoiceEntity);
  const lines = dataSource.getRepository(InvoiceLineEntity);

  const invoice = await invoices.save(
    invoices.create({
      workspaceId: options.workspace ?? workspaceId,
      number: `RE-2026-${String(Math.floor(Math.random() * 8999) + 1000)}`,
      status: options.status ?? InvoiceStatus.ISSUED,
      companyId: options.workspace === undefined ? companyId : null,
      contactId:
        options.withContact === false || options.workspace !== undefined
          ? null
          : contactId,
      recipientAddress: 'Nordwind Logistik GmbH\nHamburg',
      issuedOn: '2026-03-01',
      serviceDate: '2026-03-01',
      dueOn: options.dueOn,
      consumer: options.consumer ?? false,
      issuedAt: new Date(),
    }),
  );

  await lines.save(
    lines.create({
      invoiceId: invoice.id,
      position: 0,
      name: 'Leistung',
      quantity: 1,
      unit: 'Pauschal',
      unitPriceCents: 100_000,
      discountPercent: 0,
      taxRatePercent: 0,
    }),
  );

  return invoice;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new DunningService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceReminderEntity),
    dataSource.getRepository(WorkspaceEntity),
    belege,
    postfach,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE invoice_reminders, invoice_lines, invoices, contacts, companies, workspaces CASCADE',
  );

  versandt = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const companies = dataSource.getRepository(CompanyEntity);
  const contacts = dataSource.getRepository(ContactEntity);

  workspaceId = (
    await workspaces.save(
      workspaces.create({
        name: 'Vertrieb Demo GmbH',
        slug: 'wir',
        baseInterestRatePercent: 3,
      }),
    )
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  companyId = (
    await companies.save(
      companies.create({ workspaceId, name: 'Nordwind Logistik GmbH' }),
    )
  ).id;

  contactId = (
    await contacts.save(
      contacts.create({
        workspaceId,
        firstName: 'Anna',
        lastName: 'Schmidt',
        email: 'anna@nordwind.de',
        companyId,
      }),
    )
  ).id;
});

describe('offene Posten', () => {
  it('zeigt nichts, solange die Frist läuft', async () => {
    await rechnung({ dueOn: '2026-03-15' });

    expect(await service.openItems(workspaceId, '2026-03-10')).toHaveLength(0);
  });

  it('zeigt eine überfällige Rechnung', async () => {
    await rechnung({ dueOn: '2026-03-15' });

    const items = await service.openItems(workspaceId, '2026-03-20');

    expect(items).toHaveLength(1);
    expect(items[0].state.daysOverdue).toBe(5);
    expect(items[0].state.nextStep).toBe(DunningLevel.REMINDER);
  });

  it('lässt eine bezahlte Rechnung aus', async () => {
    await rechnung({ dueOn: '2026-03-01', status: InvoiceStatus.PAID });

    expect(await service.openItems(workspaceId, '2026-04-01')).toHaveLength(0);
  });

  it('lässt eine stornierte Rechnung aus', async () => {
    await rechnung({ dueOn: '2026-03-01', status: InvoiceStatus.CANCELLED });

    expect(await service.openItems(workspaceId, '2026-04-01')).toHaveLength(0);
  });

  it('lässt einen Entwurf aus', async () => {
    await rechnung({ dueOn: '2026-03-01', status: InvoiceStatus.DRAFT });

    expect(await service.openItems(workspaceId, '2026-04-01')).toHaveLength(0);
  });

  it('stellt die älteste nach oben', async () => {
    await rechnung({ dueOn: '2026-03-20' });
    await rechnung({ dueOn: '2026-03-01' });

    const items = await service.openItems(workspaceId, '2026-04-01');

    expect(items[0].state.daysOverdue).toBeGreaterThan(
      items[1].state.daysOverdue,
    );
  });

  it('sieht keine Rechnungen anderer Arbeitsbereiche', async () => {
    await rechnung({ dueOn: '2026-03-01', workspace: otherWorkspaceId });

    expect(await service.openItems(workspaceId, '2026-04-01')).toHaveLength(0);
  });
});

describe('was zusätzlich offen wäre', () => {
  it('rechnet Zinsen nach dem hinterlegten Basiszinssatz', async () => {
    await rechnung({ dueOn: '2026-03-01' });

    const [item] = await service.openItems(workspaceId, '2026-03-31');

    expect(item.interestCents).toBe(986);
  });

  it('rechnet keine Zinsen ohne hinterlegten Basiszinssatz', async () => {
    await dataSource
      .getRepository(WorkspaceEntity)
      .update(workspaceId, { baseInterestRatePercent: null });
    await rechnung({ dueOn: '2026-03-01' });

    const [item] = await service.openItems(workspaceId, '2026-03-31');

    expect(item.interestCents).toBe(0);
  });

  it('setzt die Pauschale erst mit dem Verzug an', async () => {
    await rechnung({ dueOn: '2026-03-01' });

    const [frueh] = await service.openItems(workspaceId, '2026-03-20');
    const [spaet] = await service.openItems(workspaceId, '2026-03-31');

    expect(frueh.lateFeeCents).toBe(0);
    expect(spaet.lateFeeCents).toBe(4000);
  });

  it('setzt gegenüber einem Verbraucher keine Pauschale an', async () => {
    await rechnung({ dueOn: '2026-03-01', consumer: true });

    const [item] = await service.openItems(workspaceId, '2026-03-31');

    expect(item.lateFeeCents).toBe(0);
  });
});

describe('den Entwurf ansehen', () => {
  it('zeigt Betreff und Text, ohne etwas zu verschicken', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    const entwurf = await service.preview(
      workspaceId,
      invoice.id,
      '2026-03-20',
    );

    expect(entwurf.level).toBe(DunningLevel.REMINDER);
    expect(entwurf.subject).toContain('Zahlungserinnerung');
    expect(entwurf.body).toContain('gegenstandslos');
    expect(versandt).toHaveLength(0);
  });
});

describe('verschicken', () => {
  it('schickt die Erinnerung und hält sie fest', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    const record = await service.send(workspaceId, invoice.id, '2026-03-20');

    expect(record.level).toBe(DunningLevel.REMINDER);
    expect(record.sentTo).toBe('anna@nordwind.de');
    expect(versandt).toHaveLength(1);
    expect(versandt[0].to).toBe('anna@nordwind.de');
  });

  it('legt die Rechnung bei', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await service.send(workspaceId, invoice.id, '2026-03-20');

    expect(versandt[0].attachments?.[0].filename).toContain('.pdf');
  });

  it('hält die Beträge fest, statt sie später neu zu rechnen', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    const record = await service.send(workspaceId, invoice.id, '2026-03-31');

    expect(record.interestCents).toBe(986);
    expect(record.lateFeeCents).toBe(4000);
    expect(record.daysOverdue).toBe(30);
  });

  it('geht beim zweiten Mal eine Stufe weiter', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await service.send(workspaceId, invoice.id, '2026-03-10');
    const zweite = await service.send(workspaceId, invoice.id, '2026-03-20');

    expect(zweite.level).toBe(DunningLevel.FIRST);
  });

  it('schickt dieselbe Stufe nicht am nächsten Tag noch einmal', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await service.send(workspaceId, invoice.id, '2026-03-10');

    await expect(
      service.send(workspaceId, invoice.id, '2026-03-11'),
    ).rejects.toThrow(BadRequestException);
    expect(versandt).toHaveLength(1);
  });

  it('hört nach der letzten Mahnung auf', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await service.send(workspaceId, invoice.id, '2026-03-10');
    await service.send(workspaceId, invoice.id, '2026-03-20');
    await service.send(workspaceId, invoice.id, '2026-03-30');

    await expect(
      service.send(workspaceId, invoice.id, '2026-04-10'),
    ).rejects.toThrow(/gehört nicht mehr/u);
  });

  it('verweigert die Mahnung ohne E-Mail-Adresse', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01', withContact: false });

    await expect(
      service.send(workspaceId, invoice.id, '2026-03-20'),
    ).rejects.toThrow(/E-Mail-Adresse/u);
    expect(versandt).toHaveLength(0);
  });

  it('mahnt keine Rechnung, die gar nicht offen ist', async () => {
    const invoice = await rechnung({
      dueOn: '2026-03-01',
      status: InvoiceStatus.PAID,
    });

    await expect(
      service.send(workspaceId, invoice.id, '2026-03-20'),
    ).rejects.toThrow(NotFoundException);
  });

  it('mahnt nicht über die Bereichsgrenze hinweg', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await expect(
      service.send(otherWorkspaceId, invoice.id, '2026-03-20'),
    ).rejects.toThrow(NotFoundException);
    expect(versandt).toHaveLength(0);
  });

  it('hält auch dann fest, wenn der Mailserver zickt', async () => {
    const kaputt = new DunningService(
      dataSource.getRepository(InvoiceEntity),
      dataSource.getRepository(InvoiceReminderEntity),
      dataSource.getRepository(WorkspaceEntity),
      belege,
      { send: () => Promise.resolve(false) } as unknown as typeof postfach,
    );

    const invoice = await rechnung({ dueOn: '2026-03-01' });
    const record = await kaputt.send(workspaceId, invoice.id, '2026-03-20');

    expect(record.level).toBe(DunningLevel.REMINDER);
  });
});

describe('der Verlauf', () => {
  it('zeigt, was zu einer Rechnung hinausging', async () => {
    const invoice = await rechnung({ dueOn: '2026-03-01' });

    await service.send(workspaceId, invoice.id, '2026-03-10');
    await service.send(workspaceId, invoice.id, '2026-03-20');

    const verlauf = await service.history(workspaceId, invoice.id);

    expect(verlauf.map((record) => record.level)).toEqual([
      DunningLevel.REMINDER,
      DunningLevel.FIRST,
    ]);
  });
});
