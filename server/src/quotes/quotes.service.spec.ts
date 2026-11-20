import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { QuoteLineEntity } from './quote-line.entity';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';
import { QuoteEntity } from './quote.entity';
import { QuoteStatus } from './quote.types';
import { type QuoteLineInput, QuotesService } from './quotes.service';

const SUITE = 'quotes';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: QuotesService;
let workspaceId: string;
let otherWorkspaceId: string;
let companyId: string;
let letterheads: LetterheadsService;

const line = (over: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  name: 'Beratung',
  quantity: 1,
  unit: 'Stunde',
  unitPriceCents: 9000,
  taxRatePercent: 19,
  ...over,
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  letterheads = new LetterheadsService(
    dataSource.getRepository(LetterheadEntity),
  );
  service = new QuotesService(
    dataSource.getRepository(QuoteEntity),
    dataSource,
    letterheads,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE quotes, companies, workspace_letterheads CASCADE',
  );

  companyId = (
    await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Nordwind GmbH',
        city: 'Hamburg',
        country: 'Deutschland',
      }),
    )
  ).id;
});

const draft = () => service.create(workspaceId, { companyId });

const sent = async () => {
  const quote = await draft();

  await service.setLines(workspaceId, quote.id, [line()]);

  return service.markSent(workspaceId, quote.id);
};

describe('the number', () => {
  it('starts at one for the year', async () => {
    const quote = await draft();

    expect(quote.number).toBe(`AN-${new Date().getFullYear()}-0001`);
  });

  it('counts up', async () => {
    await draft();
    const second = await draft();

    expect(second.number).toBe(`AN-${new Date().getFullYear()}-0002`);
  });

  it('counts separately per workspace', async () => {
    await draft();
    await draft();

    const theirs = await service.create(otherWorkspaceId, {});

    expect(theirs.number).toBe(`AN-${new Date().getFullYear()}-0001`);
  });

  it('never hands the same one out twice, even under load', async () => {
    const created = await Promise.all(Array.from({ length: 8 }, () => draft()));

    expect(new Set(created.map((quote) => quote.number)).size).toBe(8);
  });

  it('frees the number of a deleted draft, which is the intended trade', async () => {
    const first = await draft();

    await service.remove(workspaceId, first.id);

    expect((await draft()).number).toBe(first.number);
  });

  it('does not reuse the number of a quote that went out', async () => {
    const first = await sent();

    await expect(service.remove(workspaceId, first.id)).rejects.toThrow();
    expect((await draft()).number).not.toBe(first.number);
  });
});

describe('the workspace defaults', () => {
  it('uses the letterhead validity rather than the built-in thirty days', async () => {
    await letterheads.update(workspaceId, { defaultValidityDays: 14 });

    const quote = await draft();
    const days =
      (new Date(quote.validUntil).getTime() -
        new Date(quote.issuedOn).getTime()) /
      (24 * 60 * 60 * 1000);

    expect(Math.round(days)).toBe(14);
  });

  it('starts a quote with the workspace texts', async () => {
    await letterheads.update(workspaceId, {
      defaultIntroText: 'vielen Dank für Ihre Anfrage.',
      defaultClosingText: 'Wir freuen uns auf Ihre Rückmeldung.',
    });

    const quote = await draft();

    expect(quote.introText).toBe('vielen Dank für Ihre Anfrage.');
    expect(quote.closingText).toBe('Wir freuen uns auf Ihre Rückmeldung.');
  });

  it('carries the §19 status onto the quote', async () => {
    await letterheads.update(workspaceId, { smallBusiness: true });

    expect((await draft()).smallBusiness).toBe(true);
  });

  it('lets what the caller gives win over the default', async () => {
    await letterheads.update(workspaceId, {
      defaultValidityDays: 14,
      defaultIntroText: 'Vorgabe',
    });

    const quote = await service.create(workspaceId, {
      companyId,
      validUntil: '2027-01-31',
      introText: 'Eigener Text',
    });

    expect(quote.validUntil).toBe('2027-01-31');
    expect(quote.introText).toBe('Eigener Text');
  });

  it('keeps the status a quote was written under when the workspace changes', async () => {
    await letterheads.update(workspaceId, { smallBusiness: true });

    const quote = await draft();

    await letterheads.update(workspaceId, { smallBusiness: false });

    expect((await service.findOne(workspaceId, quote.id)).smallBusiness).toBe(
      true,
    );
  });
});

describe('what create hands back', () => {
  it('is the whole quote, lines and links included', async () => {
    const quote = await draft();

    expect(quote.lines).toEqual([]);
    expect(quote.company?.name).toBe('Nordwind GmbH');
  });
});

describe('what the document keeps', () => {
  it('does not disguise a real failure as a numbering clash', async () => {
    const failure = await service
      .create(workspaceId, { validUntil: 'der 32. Februar' })
      .then(
        () => 'it did not fail at all',
        (thrown: { code?: string }) => thrown.code,
      );

    expect(failure).toBe('22007');
  });

  it('copies the address rather than pointing at the company', async () => {
    const quote = await draft();

    expect(quote.recipientAddress).toContain('Nordwind GmbH');
    expect(quote.recipientAddress).toContain('Hamburg');
  });

  it('keeps that address when the company is renamed', async () => {
    const quote = await draft();

    await dataSource
      .getRepository(CompanyEntity)
      .update(companyId, { name: 'Nordwind Logistik AG' });

    expect(
      (await service.findOne(workspaceId, quote.id)).recipientAddress,
    ).toContain('Nordwind GmbH');
  });

  it('moves the address when a draft is pointed at another company', async () => {
    const other = await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Südwind KG',
        city: 'München',
      }),
    );
    const quote = await draft();

    const moved = await service.update(workspaceId, quote.id, {
      companyId: other.id,
    });

    expect(moved.recipientAddress).toContain('Südwind KG');
    expect(moved.recipientAddress).not.toContain('Nordwind');
  });

  it('keeps an address that was corrected by hand', async () => {
    const other = await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId, name: 'Südwind KG' }),
      );
    const quote = await draft();

    const moved = await service.update(workspaceId, quote.id, {
      companyId: other.id,
      recipientAddress: 'Südwind KG\nz. Hd. Frau Weber\nMünchen',
    });

    expect(moved.recipientAddress).toContain('Frau Weber');
  });

  it('is valid for thirty days unless told otherwise', async () => {
    const quote = await draft();

    const days =
      (new Date(quote.validUntil).getTime() -
        new Date(quote.issuedOn).getTime()) /
      (24 * 60 * 60 * 1000);

    expect(Math.round(days)).toBe(30);
  });
});

describe('the lines', () => {
  it('keeps them in the order they were given', async () => {
    const quote = await draft();

    const withLines = await service.setLines(workspaceId, quote.id, [
      line({ name: 'Erstens' }),
      line({ name: 'Zweitens' }),
      line({ name: 'Drittens' }),
    ]);

    expect(withLines.lines.map((entry) => entry.name)).toEqual([
      'Erstens',
      'Zweitens',
      'Drittens',
    ]);
  });

  it('writes the position onto each line rather than trusting the order back', async () => {
    const quote = await draft();

    await service.setLines(workspaceId, quote.id, [
      line({ name: 'Erstens' }),
      line({ name: 'Zweitens' }),
      line({ name: 'Drittens' }),
    ]);

    const rows = await dataSource.getRepository(QuoteLineEntity).find({
      where: { quoteId: quote.id },
      order: { name: 'ASC' },
    });

    expect(rows.map((row) => [row.name, row.position])).toEqual([
      ['Drittens', 2],
      ['Erstens', 0],
      ['Zweitens', 1],
    ]);
  });

  it('replaces the whole list rather than adding to it', async () => {
    const quote = await draft();

    await service.setLines(workspaceId, quote.id, [line(), line()]);

    const replaced = await service.setLines(workspaceId, quote.id, [line()]);

    expect(replaced.lines).toHaveLength(1);
    expect(
      await dataSource.getRepository(QuoteLineEntity).countBy({
        quoteId: quote.id,
      }),
    ).toBe(1);
  });

  it('refuses a line with nothing written on it', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ name: '  ' })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a quantity of nothing', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ quantity: 0 })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a negative price', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ unitPriceCents: -1 })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a line that costs nothing', async () => {
    const quote = await draft();

    const priced = await service.setLines(workspaceId, quote.id, [
      line({ name: 'Anfahrt inklusive', unitPriceCents: 0 }),
    ]);

    expect(priced.lines[0].unitPriceCents).toBe(0);
  });

  it('refuses a negative discount', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ discountPercent: -10 })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a discount over a hundred percent', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ discountPercent: 120 })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a tax rate that is not one of the German ones', async () => {
    const quote = await draft();

    await expect(
      service.setLines(workspaceId, quote.id, [line({ taxRatePercent: 1.9 })]),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves the old lines alone when a new one is refused', async () => {
    const quote = await draft();

    await service.setLines(workspaceId, quote.id, [line({ name: 'Gut' })]);

    await service
      .setLines(workspaceId, quote.id, [line({ quantity: -1 })])
      .catch(() => null);

    const after = await service.findOne(workspaceId, quote.id);

    expect(after.lines.map((entry) => entry.name)).toEqual(['Gut']);
  });
});

describe('once it has been sent', () => {
  it('cannot have its lines changed', async () => {
    const quote = await sent();

    await expect(
      service.setLines(workspaceId, quote.id, [line()]),
    ).rejects.toThrow(BadRequestException);
  });

  it('cannot have its dates or texts changed', async () => {
    const quote = await sent();

    await expect(
      service.update(workspaceId, quote.id, { introText: 'Neu' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cannot be deleted', async () => {
    const quote = await sent();

    await expect(service.remove(workspaceId, quote.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('records when it went', async () => {
    const quote = await sent();

    expect(quote.status).toBe(QuoteStatus.SENT);
    expect(quote.sentAt).toBeInstanceOf(Date);
  });
});

describe('sending', () => {
  it('refuses a quote with no lines', async () => {
    const quote = await draft();

    await expect(service.markSent(workspaceId, quote.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to send the same quote twice', async () => {
    const quote = await sent();

    await expect(service.markSent(workspaceId, quote.id)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('the answer', () => {
  it('records an acceptance', async () => {
    const quote = await sent();

    const decided = await service.decide(workspaceId, quote.id, true);

    expect(decided.status).toBe(QuoteStatus.ACCEPTED);
    expect(decided.decidedAt).toBeInstanceOf(Date);
  });

  it('records a refusal', async () => {
    const quote = await sent();

    expect((await service.decide(workspaceId, quote.id, false)).status).toBe(
      QuoteStatus.DECLINED,
    );
  });

  it('refuses to decide a draft nobody has seen', async () => {
    const quote = await draft();

    await expect(service.decide(workspaceId, quote.id, true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to change an answer already given', async () => {
    const quote = await sent();

    await service.decide(workspaceId, quote.id, true);

    await expect(service.decide(workspaceId, quote.id, false)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('copying', () => {
  it('makes a new draft with its own number', async () => {
    const original = await sent();

    const copy = await service.duplicate(workspaceId, original.id);

    expect(copy.status).toBe(QuoteStatus.DRAFT);
    expect(copy.number).not.toBe(original.number);
  });

  it('brings the lines with it', async () => {
    const original = await draft();

    await service.setLines(workspaceId, original.id, [
      line({ name: 'Erstens', unitPriceCents: 5000 }),
      line({ name: 'Zweitens', unitPriceCents: 2500 }),
    ]);

    const copy = await service.duplicate(workspaceId, original.id);

    expect(
      copy.lines.map((entry) => [entry.name, entry.unitPriceCents]),
    ).toEqual([
      ['Erstens', 5000],
      ['Zweitens', 2500],
    ]);
  });

  it('leaves the original alone', async () => {
    const original = await sent();

    await service.duplicate(workspaceId, original.id);

    expect((await service.findOne(workspaceId, original.id)).status).toBe(
      QuoteStatus.SENT,
    );
  });
});

describe('across workspaces', () => {
  it('reports another workspace quote as missing', async () => {
    const quote = await draft();

    await expect(service.findOne(otherWorkspaceId, quote.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lists only its own', async () => {
    await draft();
    await service.create(otherWorkspaceId, {});

    const ours = await service.list(workspaceId);

    expect(ours).toHaveLength(1);
    expect(ours[0].workspaceId).toBe(workspaceId);
  });

  it('refuses a contact from another workspace', async () => {
    const theirs = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId: otherWorkspaceId,
        firstName: 'Fremd',
        lastName: 'Person',
      }),
    );

    await expect(
      service.create(workspaceId, { contactId: theirs.id }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a deal from another workspace', async () => {
    const theirs = await dataSource
      .getRepository(DealEntity)
      .save(
        dataSource
          .getRepository(DealEntity)
          .create({ workspaceId: otherWorkspaceId, name: 'Fremder Auftrag' }),
      );

    await expect(
      service.create(workspaceId, { dealId: theirs.id }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to be pointed at another workspace by an edit', async () => {
    const theirs = await dataSource
      .getRepository(DealEntity)
      .save(
        dataSource
          .getRepository(DealEntity)
          .create({ workspaceId: otherWorkspaceId, name: 'Fremder Auftrag' }),
      );
    const quote = await draft();

    await expect(
      service.update(workspaceId, quote.id, { dealId: theirs.id }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a company from another workspace by an edit, even with an address typed', async () => {
    const theirs = await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId: otherWorkspaceId, name: 'Fremde GmbH' }),
      );
    const quote = await draft();

    await expect(
      service.update(workspaceId, quote.id, {
        companyId: theirs.id,
        recipientAddress: 'Fremde GmbH',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a company from another workspace', async () => {
    const theirCompany = await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId: otherWorkspaceId, name: 'Fremde GmbH' }),
      );

    await expect(
      service.create(workspaceId, { companyId: theirCompany.id }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('nur die Texte (für den KI-Assistenten)', () => {
  it('ändert Einleitung, Schluss und Beschreibungen, nichts an Preis und Menge', async () => {
    const quote = await draft();
    const mitZeilen = await service.setLines(workspaceId, quote.id, [
      line({ name: 'Beratung', description: 'alt' }),
      line({ name: 'Montage', unitPriceCents: 12000 }),
    ]);
    const [erste, zweite] = mitZeilen.lines;

    const neu = await service.setTexts(workspaceId, {
      id: quote.id,
      introText: 'Vielen Dank für Ihre Anfrage.',
      lines: [{ id: zweite.id, description: 'Montage vor Ort, zwei Personen' }],
    });

    expect(neu.introText).toBe('Vielen Dank für Ihre Anfrage.');
    expect(
      neu.lines.map((z) => [z.id, z.description, z.unitPriceCents]),
    ).toEqual([
      [erste.id, 'alt', 9000],
      [zweite.id, 'Montage vor Ort, zwei Personen', 12000],
    ]);
  });

  it('nimmt nur Positionen dieses Angebots und nur einen Entwurf', async () => {
    const quote = await draft();
    const anderes = await service.setLines(workspaceId, (await draft()).id, [
      line(),
    ]);

    await expect(
      service.setTexts(workspaceId, {
        id: quote.id,
        lines: [{ id: anderes.lines[0].id, description: 'fremd' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const versandt = await sent();

    await expect(
      service.setTexts(workspaceId, { id: versandt.id, closingText: 'Neu' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setTexts(otherWorkspaceId, { id: quote.id, closingText: 'Neu' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
