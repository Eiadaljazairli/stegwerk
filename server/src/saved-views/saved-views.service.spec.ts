import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { SavedViewDefaultEntity } from './saved-view-default.entity';
import { SavedViewEntity } from './saved-view.entity';
import { SavedViewsService } from './saved-views.service';

const SUITE = 'saved_views';
const COMPANY = CustomFieldEntity.COMPANY;

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: SavedViewsService;
let customFields: CustomFieldsService;
let workspaceId: string;
let otherWorkspaceId: string;
let authorId: string;
let colleagueId: string;
let adminId: string;

const addUser = async (email: string) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );
};

const addMember = async (userId: string, role: MembershipRole) => {
  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save(memberships.create({ userId, workspaceId, role }));
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  customFields = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  service = new SavedViewsService(
    dataSource.getRepository(SavedViewEntity),
    dataSource.getRepository(SavedViewDefaultEntity),
    dataSource.getRepository(MembershipEntity),
    customFields,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;

  authorId = (await addUser('autorin@example.de')).id;
  colleagueId = (await addUser('kollege@example.de')).id;
  adminId = (await addUser('admin@example.de')).id;

  await addMember(authorId, MembershipRole.MEMBER);
  await addMember(colleagueId, MembershipRole.MEMBER);
  await addMember(adminId, MembershipRole.ADMIN);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE saved_views, saved_view_defaults, custom_fields CASCADE',
  );
});

const define = (label: string, type = CustomFieldType.TEXT) =>
  customFields.create(workspaceId, { entity: COMPANY, label, type });

const save = (name: string, extra: Record<string, unknown> = {}) =>
  service.create(workspaceId, authorId, {
    entity: COMPANY,
    name,
    ...extra,
  });

describe('saving a view', () => {
  it('keeps what was on screen', async () => {
    await define('Region');

    const view = await save('Nord-Kunden', {
      search: 'GmbH',
      sortField: 'custom:region',
      sortDirection: 'DESC',
      customFilters: [{ key: 'region', operator: 'equals', value: 'Nord' }],
      filters: { industry: 'Maschinenbau' },
    });

    expect(view.search).toBe('GmbH');
    expect(view.sortField).toBe('custom:region');
    expect(view.customFilters).toHaveLength(1);
    expect(view.filters).toEqual({ industry: 'Maschinenbau' });
    expect(view.createdById).toBe(authorId);
  });

  it('merkt sich Gruppierung, ODER und Filtergruppen', async () => {
    await customFields.create(workspaceId, {
      entity: COMPANY,
      label: 'Region',
      type: CustomFieldType.SELECT,
      options: ['Nord', 'Süd'],
    });

    const view = await save('Gruppiert', {
      gruppierung: 'custom:region',
      filterVerknuepfung: 'ODER',
      customFilters: [
        { key: 'std:city', operator: 'EQUALS', value: 'Kiel' },
        { key: 'std:city', operator: 'EQUALS', value: 'Bremen', gruppe: 1 },
      ],
    });

    expect(view.gruppierung).toBe('custom:region');
    expect(view.filterVerknuepfung).toBe('ODER');

    const [gelesen] = await service.list(workspaceId, authorId, COMPANY);

    expect(gelesen.customFilters).toEqual([
      { key: 'std:city', operator: 'EQUALS', value: 'Kiel' },
      { key: 'std:city', operator: 'EQUALS', value: 'Bremen', gruppe: 1 },
    ]);

    await dataSource.query(
      `UPDATE custom_fields SET "archivedAt" = now() WHERE key = 'region'`,
    );

    const [ohne] = await service.list(workspaceId, authorId, COMPANY);

    expect(ohne.gruppierung).toBeNull();
  });

  it('refuses a second view with the same name', async () => {
    await save('Nord-Kunden');

    await expect(save('Nord-Kunden')).rejects.toThrow(BadRequestException);
  });

  it('lets another record type reuse the name', async () => {
    await save('Wichtig');

    await expect(
      service.create(workspaceId, authorId, {
        entity: CustomFieldEntity.DEAL,
        name: 'Wichtig',
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a filter on a field nothing defines', async () => {
    await expect(
      save('Kaputt', {
        customFilters: [{ key: 'erfunden', operator: 'equals', value: 'x' }],
      }),
    ).rejects.toThrow(/erfunden/);
  });

  it('stores the comparison under the name the list query takes', async () => {
    await define('Region');

    const lower = await save('Klein', {
      customFilters: [{ key: 'region', operator: 'equals', value: 'Nord' }],
    });
    const upper = await save('Gross', {
      customFilters: [{ key: 'region', operator: 'EQUALS', value: 'Nord' }],
    });

    expect(lower.customFilters).toEqual([
      { key: 'region', operator: 'EQUALS', value: 'Nord' },
    ]);
    expect(upper.customFilters).toEqual(lower.customFilters);
  });

  it('refuses a comparison that is not one', async () => {
    await define('Region');

    await expect(
      save('Kaputt', {
        customFilters: [{ key: 'region', operator: 'ungefaehr', value: 'x' }],
      }),
    ).rejects.toThrow(/ungefaehr/);
  });

  it('refuses a built-in filter this list does not have', async () => {
    await expect(
      save('Kaputt', { filters: { stage: 'lead' } }),
    ).rejects.toThrow(/stage/);
  });

  it('accepts the ones it does have', async () => {
    const view = await save('Bayern', { filters: { country: 'Deutschland' } });

    expect(view.filters).toEqual({ country: 'Deutschland' });
  });

  it('refuses a sort on a field nothing defines', async () => {
    await expect(
      save('Kaputt', { sortField: 'custom:erfunden' }),
    ).rejects.toThrow(/erfunden/);
  });

  it('drops empty filter values rather than storing them', async () => {
    const view = await save('Alles', {
      filters: { industry: '', country: null },
    });

    expect(view.filters).toEqual({});
  });
});

describe('reading views back', () => {
  it('lists only this workspace', async () => {
    await save('Unsere');
    await service.create(otherWorkspaceId, authorId, {
      entity: COMPANY,
      name: 'Fremde',
    });

    const views = await service.list(workspaceId, authorId, COMPANY);

    expect(views.map((view) => view.name)).toEqual(['Unsere']);
  });

  it('lists only the record type asked for', async () => {
    await save('Firmenansicht');
    await service.create(workspaceId, authorId, {
      entity: CustomFieldEntity.DEAL,
      name: 'Geschaeftsansicht',
    });

    const views = await service.list(workspaceId, authorId, COMPANY);

    expect(views.map((view) => view.name)).toEqual(['Firmenansicht']);
  });

  it('drops a filter whose field was archived, rather than failing', async () => {
    const field = await define('Region');

    await save('Nord', {
      customFilters: [{ key: 'region', operator: 'equals', value: 'Nord' }],
    });
    await customFields.archive(workspaceId, field.id);

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.customFilters).toEqual([]);
  });

  it('keeps the filters that still work', async () => {
    const region = await define('Region');

    await define('Kundennummer');
    await save('Gemischt', {
      customFilters: [
        { key: 'region', operator: 'equals', value: 'Nord' },
        { key: 'kundennummer', operator: 'is_not_empty' },
      ],
    });
    await customFields.archive(workspaceId, region.id);

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.customFilters).toEqual([
      { key: 'kundennummer', operator: 'IS_NOT_EMPTY' },
    ]);
  });

  it('clears a sort whose field was archived', async () => {
    const field = await define('Region');

    await save('Nach Region', {
      sortField: 'custom:region',
      sortDirection: 'DESC',
    });
    await customFields.archive(workspaceId, field.id);

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.sortField).toBeNull();
    expect(view.sortDirection).toBeNull();
  });

  it('leaves a sort on a built-in column alone', async () => {
    await save('Nach Name', { sortField: 'name', sortDirection: 'ASC' });

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.sortField).toBe('name');
  });

  it('does not write the dropped filters back to the row', async () => {
    const field = await define('Region');

    await save('Nord', {
      customFilters: [{ key: 'region', operator: 'equals', value: 'Nord' }],
    });
    await customFields.archive(workspaceId, field.id);
    await service.list(workspaceId, authorId, COMPANY);
    await customFields.restore(workspaceId, field.id);

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.customFilters).toHaveLength(1);
  });
});

describe('deleting a view', () => {
  it('lets the person who made it remove it', async () => {
    const view = await save('Meine');

    await expect(service.remove(workspaceId, authorId, view.id)).resolves.toBe(
      true,
    );
  });

  it('refuses a colleague', async () => {
    const view = await save('Meine');

    await expect(
      service.remove(workspaceId, colleagueId, view.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an admin', async () => {
    const view = await save('Meine');

    await expect(service.remove(workspaceId, adminId, view.id)).resolves.toBe(
      true,
    );
  });

  it('reports a view from another workspace as missing', async () => {
    const view = await service.create(otherWorkspaceId, authorId, {
      entity: COMPANY,
      name: 'Fremde',
    });

    await expect(service.remove(workspaceId, adminId, view.id)).rejects.toThrow(
      /gibt es nicht/i,
    );
  });
});

describe('the view a person opens the list on', () => {
  it('belongs to nobody until somebody picks one', async () => {
    await save('Nord');

    const [view] = await service.list(workspaceId, authorId, COMPANY);

    expect(view.isDefault).toBe(false);
  });

  it('is set for the person who chose it', async () => {
    const view = await save('Nord');

    await service.setDefault(workspaceId, authorId, COMPANY, view.id);

    const [seen] = await service.list(workspaceId, authorId, COMPANY);

    expect(seen.isDefault).toBe(true);
  });

  it('does not decide for a colleague', async () => {
    const view = await save('Nord');

    await service.setDefault(workspaceId, authorId, COMPANY, view.id);

    const [theirs] = await service.list(workspaceId, colleagueId, COMPANY);

    expect(theirs.isDefault).toBe(false);
  });

  it('replaces the previous choice rather than adding to it', async () => {
    const first = await save('Nord');
    const second = await save('Sued');

    await service.setDefault(workspaceId, authorId, COMPANY, first.id);
    await service.setDefault(workspaceId, authorId, COMPANY, second.id);

    const views = await service.list(workspaceId, authorId, COMPANY);

    expect(
      views.filter((view) => view.isDefault).map((view) => view.name),
    ).toEqual(['Sued']);
  });

  it('is cleared by choosing nothing', async () => {
    const view = await save('Nord');

    await service.setDefault(workspaceId, authorId, COMPANY, view.id);
    await service.setDefault(workspaceId, authorId, COMPANY, null);

    const [seen] = await service.list(workspaceId, authorId, COMPANY);

    expect(seen.isDefault).toBe(false);
  });

  it('is kept per record type', async () => {
    const companies = await save('Firmenansicht');
    const deals = await service.create(workspaceId, authorId, {
      entity: CustomFieldEntity.DEAL,
      name: 'Geschaeftsansicht',
    });

    await service.setDefault(workspaceId, authorId, COMPANY, companies.id);
    await service.setDefault(
      workspaceId,
      authorId,
      CustomFieldEntity.DEAL,
      deals.id,
    );

    const [company] = await service.list(workspaceId, authorId, COMPANY);
    const [deal] = await service.list(
      workspaceId,
      authorId,
      CustomFieldEntity.DEAL,
    );

    expect([company.isDefault, deal.isDefault]).toEqual([true, true]);
  });

  it('refuses a view from another workspace', async () => {
    const view = await service.create(otherWorkspaceId, authorId, {
      entity: COMPANY,
      name: 'Fremde',
    });

    await expect(
      service.setDefault(workspaceId, authorId, COMPANY, view.id),
    ).rejects.toThrow(/gibt es nicht/i);
  });

  it('goes away with the view it points at', async () => {
    const view = await save('Nord');

    await service.setDefault(workspaceId, authorId, COMPANY, view.id);
    await service.remove(workspaceId, authorId, view.id);

    const remaining = await dataSource
      .getRepository(SavedViewDefaultEntity)
      .count();

    expect(remaining).toBe(0);
  });
});

describe('eine neue Ansicht', () => {
  it('ist niemandes Standard und sagt das auch', async () => {
    expect((await save('Neu')).isDefault).toBe(false);
  });
});

describe('private Ansichten', () => {
  it('sieht nur, wer sie angelegt hat', async () => {
    await save('Meine Woche', { privat: true });

    const meine = await service.list(workspaceId, authorId, COMPANY);
    const fremde = await service.list(workspaceId, colleagueId, COMPANY);

    expect(meine.map((v) => v.name)).toEqual(['Meine Woche']);
    expect(fremde).toEqual([]);
  });

  it('erlaubt denselben Namen privat bei zwei Kollegen', async () => {
    await save('Meine Woche', { privat: true });
    await service.create(workspaceId, colleagueId, {
      entity: COMPANY,
      name: 'Meine Woche',
      privat: true,
    });

    await expect(
      service.create(workspaceId, colleagueId, {
        entity: COMPANY,
        name: 'Meine Woche',
        privat: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gibt es für andere nicht, auch nicht für Admins', async () => {
    const view = await save('Geheim', { privat: true });

    await expect(
      service.remove(workspaceId, adminId, view.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setDefault(workspaceId, colleagueId, COMPANY, view.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(workspaceId, adminId, { id: view.id, name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('eine Ansicht aktualisieren', () => {
  it('überschreibt, was auf dem Bildschirm steht', async () => {
    const view = await save('Nord', { search: 'alt' });

    const neu = await service.update(workspaceId, authorId, {
      id: view.id,
      search: 'neu',
      sortField: 'name',
      sortDirection: 'DESC',
    });

    expect(neu.search).toBe('neu');
    expect(neu.sortDirection).toBe('DESC');
    expect(neu.name).toBe('Nord');
  });

  it('lässt einen Kollegen nicht, einen Admin schon', async () => {
    const view = await save('Nord');

    await expect(
      service.update(workspaceId, colleagueId, { id: view.id, search: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(workspaceId, adminId, { id: view.id, search: 'x' }),
    ).resolves.toMatchObject({ search: 'x' });
    await expect(
      service.update(workspaceId, adminId, { id: view.id, privat: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nimmt Kollegen den Standard, wenn sie privat wird', async () => {
    const view = await save('Nord');

    await service.setDefault(workspaceId, colleagueId, COMPANY, view.id);
    await service.update(workspaceId, authorId, { id: view.id, privat: true });

    expect(await service.list(workspaceId, colleagueId, COMPANY)).toEqual([]);

    const zurueck = await service.update(workspaceId, authorId, {
      id: view.id,
      privat: false,
    });

    expect(zurueck.privat).toBe(false);
    expect(
      (await service.list(workspaceId, colleagueId, COMPANY))[0].isDefault,
    ).toBe(false);
  });

  it('verweigert einen Namen, den es schon gibt', async () => {
    await save('Nord');
    const sued = await save('Süd');

    await expect(
      service.update(workspaceId, authorId, { id: sued.id, name: 'Nord' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('die Darstellung einer Ansicht', () => {
  const DEAL = CustomFieldEntity.DEAL;
  const saveDeal = (name: string, darstellung?: string | null) =>
    service.create(workspaceId, authorId, {
      entity: DEAL,
      name,
      ...(darstellung === undefined ? {} : { darstellung }),
    });

  it('merkt sich das Board bei Geschäften', async () => {
    const view = await saveDeal('Pipeline-Board', 'board');

    expect(view.darstellung).toBe('board');
    expect((await service.list(workspaceId, colleagueId, DEAL))[0]).toEqual(
      expect.objectContaining({ name: 'Pipeline-Board', darstellung: 'board' }),
    );
  });

  it('speichert die Liste ausdrücklich, ohne Angabe bleibt sie leer', async () => {
    expect((await saveDeal('Als Liste', 'liste')).darstellung).toBe('liste');
    expect((await saveDeal('Ohne Angabe')).darstellung).toBeNull();
  });

  it('kennt Board und Kalender für jede Liste, lehnt Unbekanntes ab', async () => {
    expect(
      (await save('Firmen als Board', { darstellung: 'board' })).darstellung,
    ).toBe('board');
    expect((await saveDeal('Kalender', 'kalender')).darstellung).toBe(
      'kalender',
    );
    await expect(saveDeal('Zeitstrahl', 'zeitstrahl')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lässt sich überschreiben und zurück auf die Liste stellen', async () => {
    const view = await saveDeal('Nord');
    const board = await service.update(workspaceId, authorId, {
      id: view.id,
      darstellung: 'board',
    });

    expect(board.darstellung).toBe('board');

    const umbenannt = await service.update(workspaceId, authorId, {
      id: view.id,
      name: 'Nord-Board',
    });

    expect(umbenannt.darstellung).toBe('board');

    const liste = await service.update(workspaceId, authorId, {
      id: view.id,
      darstellung: 'liste',
    });

    expect(liste.darstellung).toBe('liste');

    const ohne = await service.update(workspaceId, authorId, {
      id: view.id,
      darstellung: null,
    });

    expect(ohne.darstellung).toBeNull();
  });

  it('lässt ein Mitglied die Teamansicht eines anderen nicht umstellen, einen Admin schon', async () => {
    const view = await saveDeal('Team-Board', 'board');

    await expect(
      service.update(workspaceId, colleagueId, {
        id: view.id,
        darstellung: 'liste',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const vomAdmin = await service.update(workspaceId, adminId, {
      id: view.id,
      darstellung: 'liste',
    });

    expect(vomAdmin.darstellung).toBe('liste');
  });

  it('gibt es in einem fremden Bereich nicht', async () => {
    const view = await saveDeal('Unser Board', 'board');

    await expect(
      service.update(otherWorkspaceId, authorId, {
        id: view.id,
        darstellung: 'liste',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list(otherWorkspaceId, authorId, DEAL)).toEqual([]);
  });
});

describe('Board- und Kalenderfeld einer Ansicht', () => {
  const TASK = CustomFieldEntity.TASK;
  const defineAuswahl = (label: string) =>
    customFields.create(workspaceId, {
      entity: COMPANY,
      label,
      type: CustomFieldType.SELECT,
      options: ['Neu', 'Aktiv'],
    });

  it('merkt sich ein eigenes Auswahlfeld fürs Board und ein Datumsfeld für den Kalender', async () => {
    await defineAuswahl('Status');
    await define('Vertragsende', CustomFieldType.DATE);

    const view = await save('Firmen nach Status', {
      darstellung: 'board',
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });

    expect(view.gruppenFeld).toBe('custom:status');
    expect(view.datumFeld).toBe('custom:vertragsende');
    expect((await service.list(workspaceId, colleagueId, COMPANY))[0]).toEqual(
      expect.objectContaining({
        gruppenFeld: 'custom:status',
        datumFeld: 'custom:vertragsende',
      }),
    );
  });

  it('nimmt die festen Felder der Liste', async () => {
    const firma = await save('Nach Branche', {
      darstellung: 'board',
      gruppenFeld: 'std:industry',
    });
    const aufgaben = await service.create(workspaceId, authorId, {
      entity: TASK,
      name: 'Fälligkeiten',
      darstellung: 'kalender',
      gruppenFeld: 'std:status',
      datumFeld: 'std:dueDate',
    });

    expect(firma.gruppenFeld).toBe('std:industry');
    expect(aufgaben.gruppenFeld).toBe('std:status');
    expect(aufgaben.datumFeld).toBe('std:dueDate');
  });

  it('lehnt Felder ab, die kein Board oder keinen Kalender tragen', async () => {
    await define('Notiz');
    await defineAuswahl('Status');

    await expect(
      save('Text-Board', { gruppenFeld: 'custom:notiz' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      save('Auswahl-Kalender', { datumFeld: 'custom:status' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      save('Nach Name', { gruppenFeld: 'std:name' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      save('Nach Anlage', { datumFeld: 'std:createdAt' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kennt keine Felder eines fremden Bereichs', async () => {
    await customFields.create(otherWorkspaceId, {
      entity: COMPANY,
      label: 'Status',
      type: CustomFieldType.SELECT,
      options: ['Neu', 'Aktiv'],
    });

    const view = await save('Fremdes Feld', { gruppenFeld: 'custom:status' });

    expect(view.gruppenFeld).toBeNull();
  });

  it('speichert statt eines archivierten Felds das der Liste, statt abzulehnen', async () => {
    const status = await defineAuswahl('Status');
    const ende = await define('Vertragsende', CustomFieldType.DATE);

    await customFields.archive(workspaceId, status.id);
    await customFields.archive(workspaceId, ende.id);

    const neu = await save('Gemerktes Board', {
      darstellung: 'board',
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });

    expect(neu.darstellung).toBe('board');
    expect(neu.gruppenFeld).toBeNull();
    expect(neu.datumFeld).toBeNull();

    const aktualisiert = await service.update(workspaceId, authorId, {
      id: neu.id,
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });

    expect(aktualisiert.gruppenFeld).toBeNull();
    expect(aktualisiert.datumFeld).toBeNull();
  });

  it('fällt beim Lesen auf das Feld der Liste zurück, wenn das eigene archiviert ist', async () => {
    const status = await defineAuswahl('Status');
    const ende = await define('Vertragsende', CustomFieldType.DATE);

    await save('Status-Board', {
      darstellung: 'board',
      gruppenFeld: 'custom:status',
      datumFeld: 'custom:vertragsende',
    });
    await customFields.archive(workspaceId, status.id);
    await customFields.archive(workspaceId, ende.id);

    const [gelesen] = await service.list(workspaceId, authorId, COMPANY);

    expect(gelesen.darstellung).toBe('board');
    expect(gelesen.gruppenFeld).toBeNull();
    expect(gelesen.datumFeld).toBeNull();
  });

  it('lässt nur Urheber und Admins das Feld ändern, ohne Angabe bleibt es', async () => {
    await defineAuswahl('Status');

    const view = await save('Team-Board', {
      darstellung: 'board',
      gruppenFeld: 'std:ownerId',
    });

    await expect(
      service.update(workspaceId, colleagueId, {
        id: view.id,
        gruppenFeld: 'custom:status',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const umbenannt = await service.update(workspaceId, authorId, {
      id: view.id,
      name: 'Board des Teams',
    });

    expect(umbenannt.gruppenFeld).toBe('std:ownerId');

    const vomAdmin = await service.update(workspaceId, adminId, {
      id: view.id,
      gruppenFeld: 'custom:status',
    });

    expect(vomAdmin.gruppenFeld).toBe('custom:status');

    const zurueck = await service.update(workspaceId, authorId, {
      id: view.id,
      gruppenFeld: null,
    });

    expect(zurueck.gruppenFeld).toBeNull();
  });
});
