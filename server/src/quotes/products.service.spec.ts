import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { ProductEntity } from './product.entity';
import { ProductsService } from './products.service';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';
import { QuoteEntity } from './quote.entity';
import { QuotesService } from './quotes.service';

const SUITE = 'products';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: ProductsService;
let quotes: QuotesService;
let workspaceId: string;
let otherWorkspaceId: string;

const add = (over: Partial<Parameters<ProductsService['create']>[1]> = {}) =>
  service.create(workspaceId, {
    name: 'Beratung',
    unitPriceCents: 9000,
    taxRatePercent: 19,
    ...over,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new ProductsService(dataSource.getRepository(ProductEntity));
  quotes = new QuotesService(
    dataSource.getRepository(QuoteEntity),
    dataSource,
    new LetterheadsService(dataSource.getRepository(LetterheadEntity)),
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
  await dataSource.query('TRUNCATE TABLE products, quotes, companies CASCADE');
});

describe('what the list shows', () => {
  it('leaves out what has been archived', async () => {
    const gone = await add({ name: 'Alt' });

    await service.update(workspaceId, gone.id, { active: false });
    await add({ name: 'Neu' });

    expect((await service.list(workspaceId)).map((row) => row.name)).toEqual([
      'Neu',
    ]);
  });

  it('shows the archived ones when asked', async () => {
    const gone = await add({ name: 'Alt' });

    await service.update(workspaceId, gone.id, { active: false });

    expect(await service.list(workspaceId, true)).toHaveLength(1);
  });

  it('is in alphabetical order', async () => {
    await add({ name: 'Wartung' });
    await add({ name: 'Beratung' });
    await add({ name: 'Montage' });

    expect((await service.list(workspaceId)).map((row) => row.name)).toEqual([
      'Beratung',
      'Montage',
      'Wartung',
    ]);
  });

  it('ignores another workspace', async () => {
    await add();
    await service.create(otherWorkspaceId, {
      name: 'Fremd',
      unitPriceCents: 100,
      taxRatePercent: 19,
    });

    const ours = await service.list(workspaceId);

    expect(ours).toHaveLength(1);
    expect(ours[0].name).toBe('Beratung');
  });
});

describe('adding one', () => {
  it('trims the name', async () => {
    expect((await add({ name: '  Beratung  ' })).name).toBe('Beratung');
  });

  it('defaults the unit', async () => {
    expect((await add()).unit).toBe('Stück');
  });

  it('keeps a unit that was given', async () => {
    expect((await add({ unit: 'Stunde' })).unit).toBe('Stunde');
  });

  it('refuses a name that is only spaces', async () => {
    await expect(add({ name: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('refuses a negative price', async () => {
    await expect(add({ unitPriceCents: -1 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows a price of nothing', async () => {
    expect((await add({ unitPriceCents: 0 })).unitPriceCents).toBe(0);
  });

  it('refuses a tax rate that is not one of the German ones', async () => {
    await expect(add({ taxRatePercent: 20 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stores the price as whole cents, and reads it back as a number', async () => {
    const product = await add({ unitPriceCents: 9000 });

    const stored = await dataSource
      .getRepository(ProductEntity)
      .findOneByOrFail({ id: product.id });

    expect(stored.unitPriceCents).toBe(9000);
    expect(typeof stored.unitPriceCents).toBe('number');
  });
});

describe('changing one', () => {
  it('changes only what it was given', async () => {
    const product = await add({ name: 'Beratung', unitPriceCents: 9000 });

    const changed = await service.update(workspaceId, product.id, {
      unitPriceCents: 9500,
    });

    expect(changed.name).toBe('Beratung');
    expect(changed.unitPriceCents).toBe(9500);
  });

  it('archives instead of deleting', async () => {
    const product = await add();

    await service.update(workspaceId, product.id, { active: false });

    expect(
      await dataSource.getRepository(ProductEntity).countBy({ id: product.id }),
    ).toBe(1);
  });

  it('brings an archived one back', async () => {
    const product = await add();

    await service.update(workspaceId, product.id, { active: false });
    await service.update(workspaceId, product.id, { active: true });

    expect(await service.list(workspaceId)).toHaveLength(1);
  });

  it('refuses to blank the name', async () => {
    const product = await add();

    await expect(
      service.update(workspaceId, product.id, { name: ' ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses another workspace product', async () => {
    const theirs = await service.create(otherWorkspaceId, {
      name: 'Fremd',
      unitPriceCents: 100,
      taxRatePercent: 19,
    });

    await expect(
      service.update(workspaceId, theirs.id, { unitPriceCents: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('leaves another workspace product untouched when it refuses', async () => {
    const theirs = await service.create(otherWorkspaceId, {
      name: 'Fremd',
      unitPriceCents: 100,
      taxRatePercent: 19,
    });

    await service
      .update(workspaceId, theirs.id, { unitPriceCents: 1 })
      .catch(() => null);

    const after = await dataSource
      .getRepository(ProductEntity)
      .findOneByOrFail({ id: theirs.id });

    expect(after.unitPriceCents).toBe(100);
  });
});

describe('what the catalogue does not reach', () => {
  it('leaves a quote alone when the price changes afterwards', async () => {
    const company = await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId, name: 'Nordwind GmbH' }),
      );
    const product = await add({ name: 'Beratung', unitPriceCents: 9000 });
    const quote = await quotes.create(workspaceId, { companyId: company.id });

    await quotes.setLines(workspaceId, quote.id, [
      {
        productId: product.id,
        name: product.name,
        quantity: 1,
        unit: product.unit,
        unitPriceCents: product.unitPriceCents,
        taxRatePercent: product.taxRatePercent,
      },
    ]);

    await service.update(workspaceId, product.id, { unitPriceCents: 9500 });

    const after = await quotes.findOne(workspaceId, quote.id);

    expect(after.lines[0].unitPriceCents).toBe(9000);
  });

  it('leaves a quote alone when the product is renamed or archived', async () => {
    const product = await add({ name: 'Beratung' });
    const quote = await quotes.create(workspaceId, {});

    await quotes.setLines(workspaceId, quote.id, [
      {
        productId: product.id,
        name: 'Beratung',
        quantity: 1,
        unit: 'Stunde',
        unitPriceCents: 9000,
        taxRatePercent: 19,
      },
    ]);

    await service.update(workspaceId, product.id, {
      name: 'Fachberatung',
      active: false,
    });

    expect((await quotes.findOne(workspaceId, quote.id)).lines[0].name).toBe(
      'Beratung',
    );
  });
});
