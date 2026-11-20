import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { type Feldrechte } from '../workspaces/feldrechte';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { CompanyEntity } from './entities/company.entity';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: CompaniesService;
let felder: CustomFieldsService;

let ours: string;
let theirs: string;

beforeAll(async () => {
  dataSource = await createTestDatabase('workspace_scoped');
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  service = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    felder,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  ours = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  theirs = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, 'workspace_scoped');
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
});

const seedBoth = async () => {
  const ourCompany = await service.create(ours, {
    name: 'Nordwind Logistik',
    industry: 'Logistik',
    city: 'Hamburg',
  });
  const theirCompany = await service.create(theirs, {
    name: 'Nordwind Logistik',
    industry: 'Logistik',
    city: 'Hamburg',
  });

  return { ourCompany, theirCompany };
};

describe('reading across workspaces', () => {
  it('lists only our own rows, even when the other tenant has identical ones', async () => {
    const { ourCompany } = await seedBoth();

    const page = await service.list(ours);

    expect(page.items.map((company) => company.id)).toEqual([ourCompany.id]);
    expect(page.totalCount).toBe(1);
  });

  it('counts only our own', async () => {
    await seedBoth();

    expect(await service.count(ours)).toBe(1);
  });

  it('reports a record from another workspace as missing, not forbidden', async () => {
    const { theirCompany } = await seedBoth();

    await expect(service.findOne(ours, theirCompany.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does not let a search widen the result past the workspace', async () => {
    await seedBoth();

    const page = await service.list(ours, { search: 'Hamburg' });

    expect(page.totalCount).toBe(1);
    expect(page.items[0].workspaceId).toBe(ours);
  });

  it('does not let a filter widen it either', async () => {
    await seedBoth();

    const page = await service.list(ours, {}, { industry: 'Logistik' });

    expect(page.totalCount).toBe(1);
    expect(page.items[0].workspaceId).toBe(ours);
  });

  it('keeps paging within the workspace', async () => {
    for (let index = 0; index < 5; index += 1) {
      await service.create(ours, { name: `Unsere ${index}` });
      await service.create(theirs, { name: `Fremde ${index}` });
    }

    const page = await service.list(ours, { limit: 3, offset: 0 });

    expect(page.items).toHaveLength(3);
    expect(page.totalCount).toBe(5);
    expect(page.hasMore).toBe(true);
    expect(page.items.every((company) => company.workspaceId === ours)).toBe(
      true,
    );
  });
});

describe('writing across workspaces', () => {
  it('stamps a new record with the caller workspace', async () => {
    const created = await service.create(ours, { name: 'Neue GmbH' });

    expect(created.workspaceId).toBe(ours);
  });

  it('ignores a workspaceId sent in a create', async () => {
    const created = await service.create(ours, {
      name: 'Untergeschoben',
      workspaceId: theirs,
    } as never);

    expect(created.workspaceId).toBe(ours);
  });

  it('refuses to update a record in another workspace', async () => {
    const { theirCompany } = await seedBoth();

    await expect(
      service.update(ours, theirCompany.id, { name: 'Übernommen' }),
    ).rejects.toThrow(NotFoundException);

    const untouched = await service.findOne(theirs, theirCompany.id);

    expect(untouched.name).toBe('Nordwind Logistik');
  });

  it('cannot be moved into another workspace by an update', async () => {
    const { ourCompany } = await seedBoth();

    const updated = await service.update(ours, ourCompany.id, {
      name: 'Umbenannt',
      workspaceId: theirs,
    } as never);

    expect(updated.workspaceId).toBe(ours);
    expect(updated.name).toBe('Umbenannt');
  });

  it('cannot have its id rewritten by an update', async () => {
    const { ourCompany, theirCompany } = await seedBoth();

    await service.update(ours, ourCompany.id, {
      id: theirCompany.id,
    } as never);

    expect((await service.findOne(ours, ourCompany.id)).id).toBe(ourCompany.id);
    expect((await service.findOne(theirs, theirCompany.id)).id).toBe(
      theirCompany.id,
    );
  });

  it('refuses to delete a record in another workspace', async () => {
    const { theirCompany } = await seedBoth();

    await expect(service.remove(ours, theirCompany.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.findOne(theirs, theirCompany.id),
    ).resolves.toBeDefined();
  });
});

describe('sorting', () => {
  it('ignores a sort field that is not on the allow list', async () => {
    await service.create(ours, { name: 'B GmbH' });
    await service.create(ours, { name: 'A GmbH' });

    const page = await service.list(ours, {
      sortField: 'name; DROP TABLE companies; --',
    });

    expect(page.items.map((company) => company.name)).toEqual([
      'A GmbH',
      'B GmbH',
    ]);
  });

  it('sorts by a field that is on it', async () => {
    await service.create(ours, { name: 'A GmbH', city: 'Zwickau' });
    await service.create(ours, { name: 'B GmbH', city: 'Aachen' });

    const page = await service.list(ours, { sortField: 'city' });

    expect(page.items.map((company) => company.city)).toEqual([
      'Aachen',
      'Zwickau',
    ]);
  });
});

describe('Feldrechte an eigenen Feldern mit Standardwert', () => {
  const als = <T>(rechte: Feldrechte, tun: () => Promise<T>): Promise<T> =>
    runWithRequestContext({ requestId: 'test' }, () => {
      setzeSichtfeld(() =>
        Promise.resolve({
          ich: null,
          arten: { company: 'alle', contact: 'alle', deal: 'alle' },
          felder: rechte,
        }),
      );

      return tun();
    });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE custom_fields CASCADE');
    await felder.create(ours, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Prüfstatus',
      type: CustomFieldType.TEXT,
      standardwert: 'offen',
    });
    await felder.create(ours, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Notiz',
      type: CustomFieldType.TEXT,
    });
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE custom_fields CASCADE');
  });

  it('setzt den Standardwert, auch wenn eine Rolle mit „lesen“ null schickt', async () => {
    const firma = await als({ 'custom:company:pruefstatus': 'lesen' }, () =>
      service.create(ours, {
        name: 'Nordwind',
        customFields: { pruefstatus: null },
      }),
    );

    expect(firma.customFields).toEqual({ pruefstatus: 'offen' });
  });

  it('setzt ihn auch bei einem leeren Text und für eine verborgene Spalte', async () => {
    const firma = await als({ 'custom:company:pruefstatus': 'verborgen' }, () =>
      service.create(ours, {
        name: 'Nordwind',
        customFields: { pruefstatus: '' },
      }),
    );

    expect(firma.customFields).toEqual({ pruefstatus: 'offen' });
  });

  it('lehnt einen Wert der Rolle mit „lesen“ weiterhin ab', async () => {
    await expect(
      als({ 'custom:company:pruefstatus': 'lesen' }, () =>
        service.create(ours, {
          name: 'Nordwind',
          customFields: { pruefstatus: 'erledigt' },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lässt eine Rolle mit allen Rechten den Standardwert per null abwählen', async () => {
    const firma = await als({}, () =>
      service.create(ours, {
        name: 'Nordwind',
        customFields: { pruefstatus: null },
      }),
    );

    expect(firma.customFields).toEqual({});
  });

  it('lässt ein Feld ohne Standardwert wie bisher leer', async () => {
    const firma = await als({ 'custom:company:notiz': 'lesen' }, () =>
      service.create(ours, {
        name: 'Nordwind',
        customFields: { notiz: null },
      }),
    );

    expect(firma.customFields).toEqual({ pruefstatus: 'offen' });
  });

  it('prüft beim Ändern ein null weiterhin als Schreibversuch', async () => {
    const firma = await service.create(ours, { name: 'Nordwind' });

    await expect(
      als({ 'custom:company:pruefstatus': 'lesen' }, () =>
        service.update(ours, firma.id, {
          customFields: { pruefstatus: null },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
