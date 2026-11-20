import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldEntity, CustomFieldType } from './custom-field.types';
import { CustomFieldsService } from './custom-fields.service';

const SUITE = 'custom_fields';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: CustomFieldsService;
let workspaceId: string;
let otherWorkspaceId: string;

const COMPANY = CustomFieldEntity.COMPANY;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
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
  await dataSource.query('TRUNCATE TABLE custom_fields CASCADE');
});

const define = (label: string, type = CustomFieldType.TEXT, extra = {}) =>
  service.create(workspaceId, { entity: COMPANY, label, type, ...extra });

describe('naming a field', () => {
  it.each([
    ['Kundennummer', 'kundennummer'],
    ['Mitarbeiterzahl 2026', 'mitarbeiterzahl_2026'],
    ['Schlüsselkunde', 'schluesselkunde'],
    ['Größe', 'groesse'],
    ['Straße & Nr.', 'strasse_nr'],
  ])('turns %s into the key %s', async (label, key) => {
    expect((await define(label)).key).toBe(key);
  });

  it('refuses a name with nothing to make a key from', async () => {
    await expect(define('!!!')).rejects.toThrow(BadRequestException);
  });

  it('refuses a second field that would claim the same key', async () => {
    await define('Kundennummer');

    await expect(define('  KUNDENNUMMER ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('says so when the clashing field is archived rather than live', async () => {
    const field = await define('Kundennummer');

    await service.archive(workspaceId, field.id);

    await expect(define('Kundennummer')).rejects.toThrow(/archived/i);
  });

  it('lets another workspace use the same name', async () => {
    await define('Kundennummer');

    await expect(
      service.create(otherWorkspaceId, {
        entity: COMPANY,
        label: 'Kundennummer',
        type: CustomFieldType.TEXT,
      }),
    ).resolves.toBeDefined();
  });

  it('keeps the key when the label is renamed', async () => {
    const field = await define('Kundennummer');

    const renamed = await service.update(workspaceId, field.id, {
      label: 'Kundennr.',
    });

    expect(renamed.label).toBe('Kundennr.');
    expect(renamed.key).toBe('kundennummer');
  });
});

describe('selection fields', () => {
  it('needs at least one option', async () => {
    await expect(
      define('Region', CustomFieldType.SELECT, { options: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses duplicate options', async () => {
    await expect(
      define('Region', CustomFieldType.SELECT, {
        options: ['Nord', 'Nord'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to remove an option', async () => {
    const field = await define('Region', CustomFieldType.SELECT, {
      options: ['Nord', 'Süd'],
    });

    await expect(
      service.update(workspaceId, field.id, { options: ['Nord'] }),
    ).rejects.toThrow(/Nord|Süd/);
  });

  it('allows adding one', async () => {
    const field = await define('Region', CustomFieldType.SELECT, {
      options: ['Nord'],
    });

    const updated = await service.update(workspaceId, field.id, {
      options: ['Nord', 'Süd'],
    });

    expect(updated.options).toEqual(['Nord', 'Süd']);
  });

  it('keeps no options on other types', async () => {
    const field = await define('Kundennummer', CustomFieldType.TEXT, {
      options: ['ignoriert'],
    });

    expect(field.options).toEqual([]);
  });
});

describe('checking values', () => {
  it('refuses a key nothing defines', async () => {
    await expect(
      service.validate(workspaceId, COMPANY, { erfunden: 'x' }),
    ).rejects.toThrow(/erfunden/);
  });

  it('reads the strings a form sends as the declared type', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);
    await define('Aktiv', CustomFieldType.BOOLEAN);
    await define('Datum', CustomFieldType.DATE);

    const values = await service.validate(workspaceId, COMPANY, {
      anzahl: '180',
      aktiv: 'ja',
      datum: '2027-03-31',
    });

    expect(values).toEqual({ anzahl: 180, aktiv: true, datum: '2027-03-31' });
  });

  it('refuses text that is not a number', async () => {
    await define('Anzahl', CustomFieldType.NUMBER);

    await expect(
      service.validate(workspaceId, COMPANY, { anzahl: 'viele' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses text that is not a date', async () => {
    await define('Datum', CustomFieldType.DATE);

    await expect(
      service.validate(workspaceId, COMPANY, { datum: 'irgendwann' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores a date without a time', async () => {
    await define('Datum', CustomFieldType.DATE);

    const values = await service.validate(workspaceId, COMPANY, {
      datum: '2027-03-31T22:00:00.000Z',
    });

    expect(values.datum).toBe('2027-03-31');
  });

  it('refuses a value that is not one of the options', async () => {
    await define('Region', CustomFieldType.SELECT, { options: ['Nord'] });

    await expect(
      service.validate(workspaceId, COMPANY, { region: 'Mitte' }),
    ).rejects.toThrow(/Mitte/);
  });

  it('refuses text longer than the limit', async () => {
    await define('Notiz');

    await expect(
      service.validate(workspaceId, COMPANY, { notiz: 'x'.repeat(501) }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('required fields', () => {
  it('refuses a record that leaves one empty', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { required: true });

    await expect(service.validate(workspaceId, COMPANY, {})).rejects.toThrow(
      /Kundennummer/,
    );
  });

  it('refuses clearing one that is already set', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { required: true });

    await expect(
      service.validate(
        workspaceId,
        COMPANY,
        { kundennummer: null },
        { kundennummer: 'K-1' },
      ),
    ).rejects.toThrow(/Kundennummer/);
  });

  it('accepts one that is filled in', async () => {
    await define('Kundennummer', CustomFieldType.TEXT, { required: true });

    await expect(
      service.validate(workspaceId, COMPANY, { kundennummer: 'K-1' }),
    ).resolves.toEqual({ kundennummer: 'K-1' });
  });
});

describe('merging into what a record already holds', () => {
  beforeEach(async () => {
    await define('Kundennummer');
    await define('Region', CustomFieldType.SELECT, {
      options: ['Nord', 'Süd'],
    });
  });

  it('leaves untouched fields alone', async () => {
    const values = await service.validate(
      workspaceId,
      COMPANY,
      { region: 'Süd' },
      { kundennummer: 'K-1', region: 'Nord' },
    );

    expect(values).toEqual({ kundennummer: 'K-1', region: 'Süd' });
  });

  it('clears a field sent as null', async () => {
    const values = await service.validate(
      workspaceId,
      COMPANY,
      { kundennummer: null },
      { kundennummer: 'K-1', region: 'Nord' },
    );

    expect(values).toEqual({ region: 'Nord' });
  });

  it('treats an empty string as clearing, the way a form sends it', async () => {
    const values = await service.validate(
      workspaceId,
      COMPANY,
      { kundennummer: '' },
      { kundennummer: 'K-1' },
    );

    expect(values).toEqual({});
  });
});

describe('archiving', () => {
  it('hides the field from the live list', async () => {
    const field = await define('Kundennummer');

    await service.archive(workspaceId, field.id);

    expect(await service.list(workspaceId, COMPANY)).toHaveLength(0);
    expect(await service.listAll(workspaceId)).toHaveLength(1);
  });

  it('leaves values a record already holds untouched', async () => {
    const field = await define('Kundennummer');

    await service.archive(workspaceId, field.id);

    const values = await service.validate(workspaceId, COMPANY, undefined, {
      kundennummer: 'K-1',
    });

    expect(values).toEqual({ kundennummer: 'K-1' });
  });

  it('stops accepting new values for it', async () => {
    const field = await define('Kundennummer');

    await service.archive(workspaceId, field.id);

    await expect(
      service.validate(workspaceId, COMPANY, { kundennummer: 'K-2' }),
    ).rejects.toThrow(/kundennummer/);
  });

  it('brings it back', async () => {
    const field = await define('Kundennummer');

    await service.archive(workspaceId, field.id);
    await service.restore(workspaceId, field.id);

    expect(await service.list(workspaceId, COMPANY)).toHaveLength(1);
  });
});

describe('across workspaces', () => {
  it('does not let one workspace change another workspace field', async () => {
    const field = await define('Kundennummer');

    await expect(
      service.update(otherWorkspaceId, field.id, { label: 'Übernommen' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not accept a value for a field defined elsewhere', async () => {
    await service.create(otherWorkspaceId, {
      entity: COMPANY,
      label: 'Fremdfeld',
      type: CustomFieldType.TEXT,
    });

    await expect(
      service.validate(workspaceId, COMPANY, { fremdfeld: 'x' }),
    ).rejects.toThrow(/fremdfeld/);
  });

  it('keeps the record types apart', async () => {
    await define('Kundennummer');

    await expect(
      service.validate(workspaceId, CustomFieldEntity.DEAL, {
        kundennummer: 'K-1',
      }),
    ).rejects.toThrow(/kundennummer/);
  });
});
