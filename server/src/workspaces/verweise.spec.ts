import { NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AttachmentEntity } from '../attachments/attachment.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { ContactsService } from '../crm/contacts.service';
import { DealsService } from '../crm/deals.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { NotesService } from '../crm/notes.service';
import { TasksService } from '../crm/tasks.service';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { InvoiceLineEntity } from '../invoices/invoice-line.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { QuoteStatus } from '../quotes/quote.types';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity } from './membership.entity';
import { assertVerweiseImBereich, type Verweise } from './verweise';
import { WorkspaceEntity } from './workspace.entity';

const SUITE = 'verweise';

jest.setTimeout(60_000);

type Bereich = {
  id: string;
  companyId: string;
  contactId: string;
  dealId: string;
  quoteId: string;
  invoiceId: string;
  userId: string;
};

let dataSource: DataSource;
let felder: CustomFieldsService;
let rechnungen: InvoicesService;
let unser: Bereich;
let fremd: Bereich;

const bereich = async (slug: string): Promise<Bereich> => {
  const m = dataSource.manager;
  const workspace = await m.save(
    m.create(WorkspaceEntity, { name: slug, slug }),
  );
  const company = await m.save(
    m.create(CompanyEntity, {
      workspaceId: workspace.id,
      name: `Firma ${slug}`,
    }),
  );
  const contact = await m.save(
    m.create(ContactEntity, {
      workspaceId: workspace.id,
      companyId: company.id,
      firstName: 'Jana',
      lastName: slug,
    }),
  );
  const deal = await m.save(
    m.create(DealEntity, {
      workspaceId: workspace.id,
      name: `Geschäft ${slug}`,
    }),
  );
  const quote = await m.save(
    m.create(QuoteEntity, {
      workspaceId: workspace.id,
      number: `AN-${slug}`,
      status: QuoteStatus.DRAFT,
      issuedOn: '2026-09-01',
      validUntil: '2026-10-01',
    }),
  );
  const user = await m.save(
    m.create(UserEntity, {
      email: `${slug}@verweise.example`,
      passwordHash: 'x',
      firstName: 'Max',
      lastName: slug,
    }),
  );

  await m.save(
    m.create(MembershipEntity, { userId: user.id, workspaceId: workspace.id }),
  );

  const invoice = await rechnungen.create(workspace.id, {
    companyId: company.id,
  });

  return {
    id: workspace.id,
    companyId: company.id,
    contactId: contact.id,
    dealId: deal.id,
    quoteId: quote.id,
    invoiceId: invoice.id,
    userId: user.id,
  };
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  rechnungen = new InvoicesService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceLineEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(LetterheadEntity),
    dataSource,
  );

  unser = await bereich('unser');
  fremd = await bereich('fremd');
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('die Prüfung selbst', () => {
  const pruefe = (verweise: Verweise) =>
    assertVerweiseImBereich(dataSource.manager, unser.id, verweise);

  it('lässt durch, was im eigenen Arbeitsbereich steht', async () => {
    await expect(
      pruefe({
        companyId: unser.companyId,
        contactId: unser.contactId,
        dealId: unser.dealId,
        quoteId: unser.quoteId,
        invoiceId: unser.invoiceId,
        userIds: [unser.userId],
      }),
    ).resolves.toBeUndefined();
  });

  it('übergeht, was nicht gesetzt ist', async () => {
    await expect(
      pruefe({ companyId: null, contactId: undefined, userIds: [null] }),
    ).resolves.toBeUndefined();
  });

  it.each([
    'companyId',
    'contactId',
    'dealId',
    'quoteId',
    'invoiceId',
  ] as const)('weist %s aus einem fremden Arbeitsbereich ab', async (feld) => {
    await expect(pruefe({ [feld]: fremd[feld] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('weist eine Person ab, die hier nicht Mitglied ist', async () => {
    await expect(
      pruefe({ userIds: [unser.userId, fremd.userId] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('beim Anlegen und Ändern', () => {
  const kontakte = () =>
    new ContactsService(dataSource.getRepository(ContactEntity), felder);
  const aufgaben = () =>
    new TasksService(dataSource.getRepository(TaskEntity), felder);

  it('hängt keinen neuen Kontakt an eine fremde Firma', async () => {
    await expect(
      kontakte().create(unser.id, {
        firstName: 'Ein',
        lastName: 'Dringling',
        companyId: fremd.companyId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await dataSource
        .getRepository(ContactEntity)
        .countBy({ lastName: 'Dringling' }),
    ).toBe(0);
  });

  it('hängt einen Kontakt nicht nachträglich an eine fremde Firma', async () => {
    await expect(
      kontakte().update(unser.id, unser.contactId, {
        companyId: fremd.companyId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const danach = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: unser.contactId });

    expect(danach.companyId).toBe(unser.companyId);
  });

  it('legt einen Kontakt an der eigenen Firma weiter an', async () => {
    const kontakt = await kontakte().create(unser.id, {
      firstName: 'Erlaubt',
      lastName: 'Eigen',
      companyId: unser.companyId,
    });

    expect(kontakt.companyId).toBe(unser.companyId);
  });

  it('gibt einem Geschäft keinen fremden Ansprechpartner', async () => {
    const geschaefte = new DealsService(
      dataSource.getRepository(DealEntity),
      felder,
    );

    await expect(
      geschaefte.create(unser.id, {
        name: 'Einbruch',
        primaryContactId: fremd.contactId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('weist keine Aufgabe jemandem aus einem fremden Bereich zu', async () => {
    await expect(
      aufgaben().createForTarget(
        unser.id,
        unser.userId,
        { title: 'Fremd zugewiesen', assigneeId: fremd.userId },
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hängt keine Aufgabe an ein fremdes Geschäft', async () => {
    await expect(
      aufgaben().createForTarget(
        unser.id,
        unser.userId,
        { title: 'Am fremden Geschäft' },
        { dealId: fremd.dealId },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('schreibt keine Notiz an eine fremde Firma', async () => {
    const notizen = new NotesService(
      dataSource.getRepository(NoteEntity),
      felder,
    );

    await expect(
      notizen.createForTarget(unser.id, unser.userId, 'Eingeschmuggelt', {
        companyId: fremd.companyId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('schreibt keine Rechnung an einen fremden Kontakt', async () => {
    await expect(
      rechnungen.create(unser.id, { contactId: fremd.contactId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('richtet einen Entwurf nicht nachträglich an eine fremde Firma', async () => {
    await expect(
      rechnungen.update(unser.id, {
        id: unser.invoiceId,
        companyId: fremd.companyId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const danach = await dataSource
      .getRepository(InvoiceEntity)
      .findOneByOrFail({ id: unser.invoiceId });

    expect(danach.companyId).toBe(unser.companyId);
  });

  it('hängt keine Datei an eine fremde Rechnung', async () => {
    const anhaenge = new AttachmentsService(
      dataSource.getRepository(AttachmentEntity),
      dataSource,
    );

    await expect(
      anhaenge.create({
        workspaceId: unser.id,
        userId: unser.userId,
        name: 'geheim.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4'),
        ziel: { invoiceId: fremd.invoiceId },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await dataSource
        .getRepository(AttachmentEntity)
        .countBy({ name: 'geheim.pdf' }),
    ).toBe(0);
  });
});
