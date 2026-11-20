import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';

const SUITE = 'letterheads';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: LetterheadsService;
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new LetterheadsService(dataSource.getRepository(LetterheadEntity));

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
  await dataSource.query('TRUNCATE TABLE workspace_letterheads CASCADE');
});

describe('getting one', () => {
  it('makes an empty one the first time it is asked for', async () => {
    const letterhead = await service.get(workspaceId);

    expect(letterhead.workspaceId).toBe(workspaceId);
    expect(letterhead.companyName).toBeNull();
  });

  it('returns the same one every time after that', async () => {
    const first = await service.get(workspaceId);
    const second = await service.get(workspaceId);

    expect(second.id).toBe(first.id);
    expect(await dataSource.getRepository(LetterheadEntity).count()).toBe(1);
  });

  it('still makes exactly one when several requests arrive together', async () => {
    const all = await Promise.all(
      Array.from({ length: 6 }, () => service.get(workspaceId)),
    );

    expect(new Set(all.map((entry) => entry.id)).size).toBe(1);
    expect(await dataSource.getRepository(LetterheadEntity).count()).toBe(1);
  });

  it('gives each workspace its own', async () => {
    const ours = await service.get(workspaceId);
    const theirs = await service.get(otherWorkspaceId);

    expect(theirs.id).not.toBe(ours.id);
  });

  it('starts with sensible defaults', async () => {
    const letterhead = await service.get(workspaceId);

    expect(letterhead.smallBusiness).toBe(false);
    expect(letterhead.defaultValidityDays).toBe(30);
  });
});

describe('changing one', () => {
  it('keeps what it was given', async () => {
    const saved = await service.update(workspaceId, {
      companyName: 'Nordwind Logistik GmbH',
      city: 'Hamburg',
    });

    expect(saved.companyName).toBe('Nordwind Logistik GmbH');
    expect(saved.city).toBe('Hamburg');
  });

  it('changes only the fields it was given', async () => {
    await service.update(workspaceId, { companyName: 'Nordwind' });

    const saved = await service.update(workspaceId, { city: 'Hamburg' });

    expect(saved.companyName).toBe('Nordwind');
  });

  it('trims what people type', async () => {
    const saved = await service.update(workspaceId, {
      companyName: '  Nordwind Logistik GmbH  ',
    });

    expect(saved.companyName).toBe('Nordwind Logistik GmbH');
  });

  it('treats a field cleared to spaces as cleared', async () => {
    await service.update(workspaceId, { website: 'nordwind.de' });

    expect(
      (await service.update(workspaceId, { website: '   ' })).website,
    ).toBeNull();
  });

  it('accepts an IBAN with the spaces people actually type', async () => {
    const saved = await service.update(workspaceId, {
      iban: 'DE89 3704 0044 0532 0130 00',
    });

    expect(saved.iban).toBe('DE89 3704 0044 0532 0130 00');
  });

  it('refuses an IBAN with a digit wrong', async () => {
    await expect(
      service.update(workspaceId, { iban: 'DE89370400440532013100' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the IBAN to be left empty', async () => {
    expect((await service.update(workspaceId, { iban: '' })).iban).toBeNull();
  });

  it('refuses a German VAT id of the wrong length', async () => {
    await expect(
      service.update(workspaceId, { vatId: 'DE12345678' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a validity of zero days', async () => {
    await expect(
      service.update(workspaceId, { defaultValidityDays: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a validity beyond a year', async () => {
    await expect(
      service.update(workspaceId, { defaultValidityDays: 400 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a fraction of a day', async () => {
    await expect(
      service.update(workspaceId, { defaultValidityDays: 14.5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves nothing at all when one field is refused', async () => {
    await service.update(workspaceId, { companyName: 'Nordwind' });

    await service
      .update(workspaceId, { companyName: 'Südwind', iban: 'DE00' })
      .catch(() => null);

    expect((await service.get(workspaceId)).companyName).toBe('Nordwind');
  });

  it('leaves another workspace alone', async () => {
    await service.update(workspaceId, { companyName: 'Nordwind' });
    await service.update(otherWorkspaceId, { companyName: 'Südwind' });

    expect((await service.get(workspaceId)).companyName).toBe('Nordwind');
  });
});

describe('what is still missing', () => {
  it('lists everything for a letterhead nobody has filled in', async () => {
    expect((await service.gaps(workspaceId)).length).toBeGreaterThan(0);
  });

  it('is empty once the required details are there', async () => {
    await service.update(workspaceId, {
      companyName: 'Nordwind Logistik GmbH',
      street: 'Hafenstraße 12',
      postalCode: '20457',
      city: 'Hamburg',
      representative: 'Anna Schmidt',
      taxNumber: '22/815/00123',
      iban: 'DE89370400440532013000',
    });

    expect(await service.gaps(workspaceId)).toEqual([]);
  });
});
