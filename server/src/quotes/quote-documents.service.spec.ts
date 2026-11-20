import { inflateSync } from 'node:zlib';

import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';
import { QuoteDocumentsService } from './quote-documents.service';
import { QuoteEntity } from './quote.entity';
import { QuotesService } from './quotes.service';

const SUITE = 'quote-documents';

jest.setTimeout(60_000);

let dataSource: DataSource;
let documents: QuoteDocumentsService;
let quotes: QuotesService;
let letterheads: LetterheadsService;
let workspaceId: string;
let companyId: string;

const WIN_ANSI_HIGH: Record<number, string> = { 0x80: '€' };

const textOf = (pdf: Buffer): string => {
  const out: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)endstream/gu;
  let match = streams.exec(pdf.toString('latin1'));

  while (match !== null) {
    const bytes = Buffer.from(match[1], 'latin1');
    let content: string;

    try {
      content = inflateSync(bytes).toString('latin1');
    } catch {
      content = bytes.toString('latin1');
    }

    const blocks = /BT([\s\S]*?)ET/gu;
    let block = blocks.exec(content);

    while (block !== null) {
      const hex = [...block[1].matchAll(/<([0-9a-fA-F]*)>/gu)]
        .map((piece) => piece[1])
        .join('');

      if (hex !== '') {
        out.push(
          [...Buffer.from(hex, 'hex')]
            .map((byte) => WIN_ANSI_HIGH[byte] ?? String.fromCharCode(byte))
            .join(''),
        );
      }

      block = blocks.exec(content);
    }

    match = streams.exec(pdf.toString('latin1'));
  }

  return out.join('\n');
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  letterheads = new LetterheadsService(
    dataSource.getRepository(LetterheadEntity),
  );
  quotes = new QuotesService(
    dataSource.getRepository(QuoteEntity),
    dataSource,
    letterheads,
  );
  documents = new QuoteDocumentsService(quotes, letterheads);

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE quotes, companies, contacts, workspace_letterheads CASCADE',
  );

  companyId = (
    await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Südwind Handels KG',
        city: 'München',
        country: 'Deutschland',
      }),
    )
  ).id;
});

const withLines = async () => {
  const quote = await quotes.create(workspaceId, { companyId });

  await quotes.setLines(workspaceId, quote.id, [
    {
      name: 'Beratung',
      quantity: 2.5,
      unit: 'Stunde',
      unitPriceCents: 9000,
      discountPercent: 10,
      taxRatePercent: 19,
    },
    {
      name: 'Handbuch',
      quantity: 3,
      unit: 'Stück',
      unitPriceCents: 2500,
      taxRatePercent: 7,
    },
  ]);

  return quote;
};

describe('the file name', () => {
  it('is the quote number, not the id', async () => {
    const quote = await withLines();

    const { fileName } = await documents.pdf(workspaceId, quote.id);

    expect(fileName).toBe(`Angebot-${quote.number}.pdf`);
  });
});

describe('the assembled document', () => {
  it('carries the address that was copied onto the quote', async () => {
    const quote = await withLines();

    const { content } = await documents.pdf(workspaceId, quote.id);

    expect(textOf(content)).toContain('Südwind Handels KG');
  });

  it('adds up to the same figures the API reports', async () => {
    const quote = await withLines();

    const { content } = await documents.pdf(workspaceId, quote.id);
    const text = textOf(content);

    expect(text).toContain('277,50 €');
    expect(text).toContain('zzgl. 7 % USt. auf 75,00 €');
    expect(text).toContain('zzgl. 19 % USt. auf 202,50 €');
  });

  it('prints the workspace letterhead along the bottom', async () => {
    await letterheads.update(workspaceId, {
      companyName: 'Nordwind Logistik GmbH',
      street: 'Hafenstraße 12',
      postalCode: '20457',
      city: 'Hamburg',
      registerEntry: 'Amtsgericht Hamburg HRB 123456',
      iban: 'DE89370400440532013000',
    });

    const quote = await withLines();

    const text = textOf((await documents.pdf(workspaceId, quote.id)).content);

    expect(text).toContain('Amtsgericht Hamburg HRB 123456');
    expect(text).toContain('DE89 3704 0044 0532 0130 00');
  });

  it('names the contact the quote is addressed to', async () => {
    const contact = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Elke',
        lastName: 'Weber',
      }),
    );
    const quote = await quotes.create(workspaceId, {
      companyId,
      contactId: contact.id,
    });

    await quotes.setLines(workspaceId, quote.id, [
      {
        name: 'Beratung',
        quantity: 1,
        unit: 'Stunde',
        unitPriceCents: 9000,
        taxRatePercent: 19,
      },
    ]);

    expect(
      textOf((await documents.pdf(workspaceId, quote.id)).content),
    ).toContain('Elke Weber');
  });

  it('says §19 when the quote was written under it, whatever the workspace says now', async () => {
    await letterheads.update(workspaceId, { smallBusiness: true });

    const quote = await withLines();

    await letterheads.update(workspaceId, { smallBusiness: false });

    expect(
      textOf((await documents.pdf(workspaceId, quote.id)).content),
    ).toContain('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  });

  it('refuses a quote belonging to another workspace', async () => {
    const workspaces = dataSource.getRepository(WorkspaceEntity);
    const other = await workspaces.save(
      workspaces.create({ name: 'Fremde', slug: 'fremde' }),
    );
    const quote = await withLines();

    await expect(documents.pdf(other.id, quote.id)).rejects.toThrow();
  });

  it('renders a draft that has no letterhead yet', async () => {
    const quote = await withLines();

    const { content } = await documents.pdf(workspaceId, quote.id);

    expect(content.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
